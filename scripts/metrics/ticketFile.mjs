// The committed form of a ticket's phases, docs/metrics/tickets/<n>.json (#134). One file per
// ticket so parallel loops never touch the same file. The text depends on the record alone, so
// re-running `metrics:ticket` rewrites the same bytes: one segment per line keeps diffs readable.
import { SESSION_CATEGORY_IDS } from './phaseCategories.mjs'

export const TICKET_FILES_DIR = 'docs/metrics/tickets'

export function ticketFileNameOf(ticket) {
  return `${ticket}.json`
}

function fieldLine(key, value) {
  if (key !== 'segments') return `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`
  const rows = value.map((segment) => `    ${JSON.stringify(segment)}`)
  return rows.length ? `  "segments": [\n${rows.join(',\n')}\n  ]` : '  "segments": []'
}

/** A ticket record as the file's text: fields in record order, segments one per line. */
export function serializeTicketRecord(record) {
  const fields = Object.entries(record).map(([key, value]) => fieldLine(key, value))
  return `{\n${fields.join(',\n')}\n}\n`
}

function sumOf(totals, ids) {
  return ids.reduce((sum, id) => sum + (totals[id] ?? 0), 0)
}

/** The share (0..1) of all session time in `category` across the records; null with none. */
export function shareOfSessionTime(records, category) {
  const session = records.reduce((sum, r) => sum + sumOf(r.totals, SESSION_CATEGORY_IDS), 0)
  if (session === 0) return null
  return records.reduce((sum, r) => sum + (r.totals[category] ?? 0), 0) / session
}
