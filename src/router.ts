export type ProviderId = 'claude' | 'chatgpt' | 'gemini'
export type TaskType = 'code' | 'image' | 'writing' | 'research' | 'chat'

const signals: [TaskType, RegExp][] = [
  ['image', /\b(draw|generate|create|make)\b.{0,30}\b(image|picture|logo|illustration|photo|poster)\b/i],
  ['code', /```|\b(function|refactor|bug|stack ?trace|compile|typescript|javascript|npm|regex|sql)\b/i],
  ['research', /\b(compare|latest|news|sources|summari[sz]e|research)\b/i],
  ['writing', /\b(email|essay|rewrite|proofread|translate|blog|cover letter)\b/i],
]

export function classify(prompt: string): TaskType {
  for (const [type, re] of signals) if (re.test(prompt)) return type
  return 'chat'
}

// Tune these from the decision log after a week of use. code and image are own picks, the rest are guesses.
export const profile: Record<TaskType, Partial<Record<ProviderId, number>>> = {
  code: { claude: 1.0, chatgpt: 0.7, gemini: 0.6 },
  image: { chatgpt: 1.0, gemini: 0.7 },
  writing: { claude: 0.9, chatgpt: 0.8, gemini: 0.7 },
  research: { gemini: 0.9, chatgpt: 0.8, claude: 0.7 },
  chat: { chatgpt: 0.8, gemini: 0.8, claude: 0.8 },
}

export interface LaneInfo {
  health: 'ready' | 'login-needed' | 'down' | 'limited'
  warm: boolean
}

export interface Decision {
  provider: ProviderId
  type: TaskType
  reason: string
  alternatives: ProviderId[]
  prompt: string // with any @provider prefix stripped
}

export function pick(
  raw: string,
  lanes: Record<ProviderId, LaneInfo>,
  thread?: { provider: ProviderId; type: TaskType },
): Decision | null {
  const explicit = raw.match(/^@(claude|chatgpt|gemini)\b\s*/i)
  const prompt = explicit ? raw.slice(explicit[0].length) : raw
  const type = classify(prompt)
  if (explicit) {
    return { provider: explicit[1].toLowerCase() as ProviderId, type, reason: 'explicit', alternatives: [], prompt }
  }

  const ranked = (Object.entries(profile[type]) as [ProviderId, number][])
    .filter(([id]) => lanes[id].health === 'ready')
    .map(([id, w]) => {
      const warm = lanes[id].warm ? 0.1 : 0
      const sticky = thread && thread.type === type && thread.provider === id ? 0.15 : 0
      return [id, w + warm + sticky] as const
    })
    .sort((a, b) => b[1] - a[1])

  if (ranked.length === 0) return null
  return {
    provider: ranked[0][0],
    type,
    reason: `${type} task`,
    alternatives: ranked.slice(1).map(([id]) => id),
    prompt,
  }
}
