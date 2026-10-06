/**
 * Tables and sections of the session report page (#125): every number a chart draws is also in
 * a table, the page's text view. Cells are escaped here, so callers pass plain text.
 */
import { escapeHtml } from './sessionChart'

export type Cell = string | number

export interface Table {
  headers: readonly string[]
  rows: readonly (readonly Cell[])[]
  /** Rows to mark, by index: a flag a reader must not miss, said in a cell too. */
  flaggedRows?: ReadonlySet<number>
}

export function tableHtml({ headers, rows, flaggedRows }: Table): string {
  if (rows.length === 0) return '<p class="none">None.</p>'
  return [
    '<table>',
    `<thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead>`,
    '<tbody>',
    ...rows.map((row, at) => rowHtml(row, flaggedRows?.has(at) ?? false)),
    '</tbody>',
    '</table>',
  ].join('\n')
}

function rowHtml(row: readonly Cell[], isFlagged: boolean): string {
  const cells = row.map((cell) => `<td>${escapeHtml(String(cell))}</td>`).join('')
  return isFlagged ? `<tr class="flagged">${cells}</tr>` : `<tr>${cells}</tr>`
}

export function sectionHtml(id: string, heading: string, intro: string, body: string): string {
  return [
    `<section id="${id}">`,
    `<h2>${escapeHtml(heading)}</h2>`,
    `<p class="intro">${escapeHtml(intro)}</p>`,
    body,
    '</section>',
  ].join('\n')
}

/** Indexes of the rows that pass `isFlagged`. */
export function flaggedIndexes<T>(items: readonly T[], isFlagged: (item: T) => boolean) {
  return new Set(items.flatMap((item, at) => (isFlagged(item) ? [at] : [])))
}

export function fixed(value: number | null, decimals: number): string {
  return value === null ? 'n/a' : value.toFixed(decimals)
}
