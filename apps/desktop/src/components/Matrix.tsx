import type { Verdict } from '../lib/cross.ts'
import type { MatrixData } from '../state/useThread.ts'

const MARK: Record<Verdict | 'unknown', { text: string; cls: string }> = {
  agree: { text: '✓ agree', cls: 'text-good' },
  partial: { text: '~ partial', cls: 'text-warn' },
  disagree: { text: '✗ disagree', cls: 'text-bad' },
  unknown: { text: '? unclear', cls: 'text-dim' },
}
const cell = 'border-b border-line px-4 py-1.5 text-center'

export function Matrix({ data }: { data: MatrixData }) {
  return (
    <div className="overflow-x-auto select-text">
      <table className="mx-auto mt-4 border-separate border-spacing-0 rounded-[10px] border border-line bg-panel text-[12.5px]">
        <caption className="caption-top pb-2 text-muted">Reviewer (row) on answer (column)</caption>
        <thead>
          <tr>
            <th className={cell} />
            {data.names.map((n) => (
              <th key={n} className={`${cell} font-semibold`}>{n}</th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr:last-child>*]:border-b-0">
          {data.names.map((reviewer, r) => (
            <tr key={reviewer}>
              <th className={`${cell} font-semibold`}>{reviewer}</th>
              {data.cells[r].map((v, c) => {
                if (v === null) return <td key={c} className={cell}>—</td>
                const m = MARK[v ?? 'unknown']
                return <td key={c} className={`${cell} ${m.cls}`}>{m.text}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
