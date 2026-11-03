export type Verdict = 'agree' | 'partial' | 'disagree'

export function reviewPrompt(question: string, others: { name: string; text: string }[]) {
  const body = others.map((o) => `### ${o.name}\n${o.text}`).join('\n\n')
  return [
    'Other AIs answered the question below. Compare their answers with your own: point out factual errors and real disagreements, briefly.',
    'Then end with exactly one line per AI, in the form "<name>: agree", "<name>: partial" or "<name>: disagree".',
    `Question:\n${question}`,
    `Answers:\n${body}`,
  ].join('\n\n')
}

// Verdicts aligned with names. The last matching line wins: models put the summary at the end.
export function parseVerdicts(text: string, names: string[]): (Verdict | undefined)[] {
  const lines = text
    .split('\n')
    .reverse()
    .map((l) => l.replace(/[*_`#>]/g, '').replace(/^[\s\-•]+/, '').toLowerCase())
  return names.map((n) => {
    const key = n.toLowerCase()
    for (const l of lines) {
      if (!l.startsWith(key)) continue
      const m = l.slice(key.length).replace(/^[\s:\-–—=]+/, '').match(/^(agree|partial|disagree)/)
      if (m) return m[1] as Verdict
    }
    return undefined
  })
}
