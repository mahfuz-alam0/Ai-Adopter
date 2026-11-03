use tauri::{utils::config::BackgroundThrottlingPolicy, AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

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

#[tauri::command]
async fn lane_open(app: AppHandle, id: String, url: String, show: bool, sel: String) -> Result<(), String> {
    // The id is a window label, a data-dir name, and the macOS store identifier (16 bytes), so keep it short and plain.
    if id.is_empty() || id.len() > 16 || !id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_') {
        return Err("bad lane id".into());
    }
    if app.get_webview_window(&id).is_some() {
        return Ok(());
    }
    let url: tauri::Url = url.parse().map_err(|e| format!("{e}"))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("lane url must be http(s)".into());
    }
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join(&id);
    let b = WebviewWindowBuilder::new(&app, &id, WebviewUrl::External(url))
        .title(&id)
        .visible(show)
        .data_directory(data_dir)
        .background_throttling(BackgroundThrottlingPolicy::Disabled)
        .initialization_script(init_script(&sel)?);
    // macOS ignores data_directory; a per-provider store id keeps cookies apart (macOS 14+).
    #[cfg(target_os = "macos")]
    let b = {
        let mut ident = [0u8; 16];
        let n = id.len().min(16);
        ident[..n].copy_from_slice(&id.as_bytes()[..n]);
        b.data_store_identifier(ident)
    };
    b.build().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn lane_eval(app: AppHandle, id: String, js: String) -> Result<String, String> {
    let win = app.get_webview_window(&id).ok_or("lane not open")?;
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

#[tauri::command]
async fn lane_show(app: AppHandle, id: String) -> Result<(), String> {
    let win = app.get_webview_window(&id).ok_or("lane not open")?;
    win.show().map_err(|e| e.to_string())?;
    win.set_focus().map_err(|e| e.to_string())
}

#[tauri::command]
async fn lane_close(app: AppHandle, id: String) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(&id) {
        win.destroy().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![lane_open, lane_eval, lane_show, lane_close])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
