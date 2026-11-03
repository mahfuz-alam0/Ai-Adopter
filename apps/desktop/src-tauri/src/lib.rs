use std::io::{Read, Write};
use std::net::TcpListener;
use std::time::{Duration, Instant};
use tauri::{utils::config::BackgroundThrottlingPolicy, AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Rect, Webview, WebviewUrl, WebviewWindowBuilder};

// Lane script = provider selectors (JSON from the frontend) + shared driver. Provider windows get no
// capability, so these scripts cannot reach Rust; Rust only reaches them through eval.
fn init_script(sel: &str) -> Result<String, String> {
    // Parse and re-serialize so only valid JSON ever lands in the page script.
    let sel: serde_json::Value = serde_json::from_str(sel).map_err(|e| e.to_string())?;
    if !sel.is_object() {
        return Err("sel must be a JSON object".into());
    }
    Ok(format!("window.__SEL = {sel};\n{}", include_str!("../lanes/base.js")))
}

fn build_lane(app: &AppHandle, id: &str, url: &str, sel: &str) -> Result<tauri::WebviewWindow, String> {
    // The id is a window label, a data-dir name, and the macOS store identifier (16 bytes), so keep it short and plain.
    if id.is_empty() || id.len() > 16 || !id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_') {
        return Err("bad lane id".into());
    }
    let url: tauri::Url = url.parse().map_err(|e| format!("{e}"))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("lane url must be http(s)".into());
    }
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join(id);
    let b = WebviewWindowBuilder::new(app, id, WebviewUrl::External(url))
        .title(id)
        .visible(false) // never shown as a window: lane_embed moves the page into the main window
        // Tauri's default 800x600 sits on chat sites' mobile/desktop breakpoint: ChatGPT's sidebar flickers open and
        // shut there. Desktop size keeps every site (and its selectors) on the desktop layout.
        .inner_size(1100.0, 720.0)
        .min_inner_size(960.0, 560.0)
        .center()
        .data_directory(data_dir)
        .background_throttling(BackgroundThrottlingPolicy::Disabled)
        .initialization_script(init_script(sel)?);
    // Google refuses sign-in in embedded webviews by user agent, and WKWebView's lacks the Safari token.
    // ponytail: fixed Safari version string; bump it if Google starts rejecting it.
    #[cfg(target_os = "macos")]
    let b = b.user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15");
    // macOS ignores data_directory; a per-provider store id keeps cookies apart (macOS 14+).
    #[cfg(target_os = "macos")]
    let b = {
        let mut ident = [0u8; 16];
        let n = id.len().min(16);
        ident[..n].copy_from_slice(&id.as_bytes()[..n]);
        b.data_store_identifier(ident)
    };
    b.build().map_err(|e| e.to_string())
}

// Shared Google session: the "google" lane holds the one real Google sign-in. Its google.com cookies are copied
// into each provider lane as it opens, so "Continue with Google" on a provider site finds the account.
// Stores stay separate; only these cookies move, and only Rust moves them (provider pages have no capability).
const GOOGLE: &str = "google";
static GOOGLE_LOCK: std::sync::OnceLock<tokio::sync::Mutex<()>> = std::sync::OnceLock::new();

// Hidden unless the frontend shows it. Locked so lanes opening together do not both build the window.
async fn google_window(app: &AppHandle) -> Result<Webview, String> {
    let _guard = GOOGLE_LOCK.get_or_init(Default::default).lock().await;
    match app.get_webview(GOOGLE) {
        Some(w) => Ok(w),
        None => build_lane(app, GOOGLE, "https://accounts.google.com/", "{}").map(|w| w.as_ref().clone()),
    }
}

fn google_cookies(w: &Webview) -> Result<Vec<tauri::webview::Cookie<'static>>, String> {
    let all = w.cookies().map_err(|e| e.to_string())?;
    Ok(all.into_iter().filter(|c| c.domain().is_some_and(|d| d.trim_start_matches('.').ends_with("google.com"))).collect())
}

async fn copy_google(app: &AppHandle, to: &Webview) -> Result<(), String> {
    for c in google_cookies(&google_window(app).await?)? {
        let _ = to.set_cookie(c);
    }
    Ok(())
}

#[tauri::command]
async fn lane_open(app: AppHandle, id: String, url: String, sel: String, google: Option<bool>) -> Result<(), String> {
    if app.get_webview(&id).is_some() {
        return Ok(());
    }
    let win = build_lane(&app, &id, &url, &sel)?;
    if google == Some(true) && id != GOOGLE {
        // Best effort: a lane that misses the copy still opens, the user then signs in to Google on the site.
        let _ = copy_google(&app, win.as_ref()).await;
    }
    Ok(())
}

// Whether the google lane holds a Google login. SID is Google's session cookie; it only exists after sign-in.
#[tauri::command]
async fn google_signed_in(app: AppHandle) -> Result<bool, String> {
    let Some(w) = app.get_webview(GOOGLE) else { return Ok(false) };
    Ok(google_cookies(&w)?.iter().any(|c| c.name() == "SID"))
}

// Push the Google cookies into a lane that is already open (it was opened before the sign-in).
#[tauri::command]
async fn google_sync(app: AppHandle, id: String) -> Result<(), String> {
    let to = app.get_webview(&id).ok_or("lane not open")?;
    copy_google(&app, &to).await
}

// ponytail: lanes that already hold a copy keep it (Gemini's own login lives in it); only the shared session is dropped.
#[tauri::command]
async fn google_signout(app: AppHandle) -> Result<(), String> {
    let w = google_window(&app).await?;
    for c in google_cookies(&w)? {
        let _ = w.delete_cookie(c);
    }
    Ok(())
}

#[tauri::command]
async fn lane_eval(app: AppHandle, id: String, js: String) -> Result<String, String> {
    let win = app.get_webview(&id).ok_or("lane not open")?;
    let (tx, rx) = tokio::sync::oneshot::channel();
    let tx = std::sync::Mutex::new(Some(tx));
    win.eval_with_callback(js, move |out| {
        if let Some(tx) = tx.lock().unwrap().take() {
            let _ = tx.send(out);
        }
    })
    .map_err(|e| e.to_string())?;
    rx.await.map_err(|e| e.to_string())
}

// Show a lane's page inside the main window, at a rect in CSS px (the frame the UI draws for it). The page keeps
// its session and scripts; only its parent changes. Called again whenever the frame moves or resizes.
#[tauri::command]
async fn lane_embed(app: AppHandle, id: String, x: f64, y: f64, w: f64, h: f64) -> Result<(), String> {
    let wv = app.get_webview(&id).ok_or("lane not open")?;
    if wv.window().label() != "main" {
        let main = app.get_window("main").ok_or("no main window")?;
        wv.reparent(&main).map_err(|e| e.to_string())?;
    }
    wv.set_bounds(Rect { position: LogicalPosition::new(x, y).into(), size: LogicalSize::new(w, h).into() }).map_err(|e| e.to_string())?;
    wv.show().map_err(|e| e.to_string())
}

// The frame went away but the lane lives on (login check in flight): hide the page, keep it loaded.
#[tauri::command]
async fn lane_hide(app: AppHandle, id: String) -> Result<(), String> {
    app.get_webview(&id).ok_or("lane not open")?.hide().map_err(|e| e.to_string())
}

#[tauri::command]
async fn lane_close(app: AppHandle, id: String) -> Result<(), String> {
    // An embedded page lives in the main window and left an empty hidden window behind; drop both.
    if let Some(wv) = app.get_webview(&id) {
        if wv.window().label() != id {
            wv.close().map_err(|e| e.to_string())?;
        }
    }
    if let Some(win) = app.get_window(&id) {
        win.destroy().map_err(|e| e.to_string())?;
    }
    Ok(())
}

// Dev timing log from the frontend, printed in the terminal running `npm run dev:tauri`. Release builds stay silent.
#[tauri::command]
fn dev_log(line: String) {
    if cfg!(debug_assertions) {
        eprintln!("{line}");
    }
}

// One-shot loopback listener for the sign-in redirect. Returns the port; emits "auth-code" with the
// one-time code from GET /cb?code=..., then stops. Gives up after 5 minutes.
#[tauri::command]
fn auth_listen(app: AppHandle) -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    std::thread::spawn(move || {
        let deadline = Instant::now() + Duration::from_secs(300);
        while Instant::now() < deadline {
            let Ok((mut stream, _)) = listener.accept() else {
                std::thread::sleep(Duration::from_millis(100));
                continue;
            };
            // Accepted sockets can inherit non-blocking mode (macOS), so reset it.
            let _ = stream.set_nonblocking(false);
            let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
            let mut buf = [0u8; 2048];
            let n = stream.read(&mut buf).unwrap_or(0);
            let head = String::from_utf8_lossy(&buf[..n]);
            let code = head
                .lines()
                .next()
                .and_then(|l| l.strip_prefix("GET /cb?code="))
                .and_then(|l| l.split(' ').next())
                .filter(|c| !c.is_empty() && c.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_'));
            let (status, msg) = match code {
                Some(_) => ("200 OK", "Signed in. You can close this tab and return to AI Hub."),
                None => ("404 Not Found", "Not found."),
            };
            let _ = write!(
                stream,
                "HTTP/1.1 {status}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{msg}",
                msg.len()
            );
            if let Some(c) = code {
                let _ = app.emit("auth-code", c);
                break;
            }
        }
    });
    Ok(port)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![lane_open, google_signed_in, google_sync, google_signout, lane_eval, lane_embed, lane_hide, lane_close, auth_listen, dev_log])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
