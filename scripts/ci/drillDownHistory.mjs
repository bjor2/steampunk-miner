// The drill-down run's history (ticket 416): one JSON line per browser run of
// e2e/browser/drillDown.spec.ts, kept on the `test-metrics` branch as drill-down.ndjson and shown
// on the status page's Tests tab. Append-only like docs/perf/history.ndjson: a row is never
// rewritten, and a row already held (same id) is skipped, because the Tester records after every
// phase and a push retry writes the record again on a fresh checkout.

export const DRILL_DOWN_HISTORY_FILE = 'drill-down.ndjson'
export const DRILL_DOWN_ROW_SCHEMA = 1

const STRING_FIELDS = ['id', 'measuredAt', 'buildCommit']
const WHOLE_FIELDS = ['schema', 'seed', 'planet', 'drillLevel']
const NUMBER_FIELDS = [
  'holdMs',
  'ticks',
  'depthGainedTiles',
  'descentMetres',
  'cellsPerSecond',
  'speedMetresPerSecond',
]
const POINT_FIELDS = ['x', 'y', 'depthTiles']

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value)

function fieldProblems(row, fields, isValid, rule, prefix = '') {
  return fields.filter((name) => !isValid(row?.[name])).map((name) => `${prefix}${name} ${rule}`)
}

function pointProblems(row, name) {
  return fieldProblems(row[name], POINT_FIELDS, isFiniteNumber, 'must be a number', `${name}.`)
}

/** What is wrong with a row before it may join the history; empty when nothing is. */
export function drillDownRowProblems(row) {
  return [
    ...fieldProblems(row, STRING_FIELDS, (value) => typeof value === 'string', 'must be a string'),
    ...fieldProblems(row, WHOLE_FIELDS, Number.isSafeInteger, 'must be a whole number'),
    ...fieldProblems(row, NUMBER_FIELDS, isFiniteNumber, 'must be a number'),
    ...pointProblems(row, 'start'),
    ...pointProblems(row, 'end'),
  ]
}

function heldIdsOf(historyText) {
  const ids = new Set()
  for (const line of historyText.split('\n')) {
    try {
      if (line.trim()) ids.add(JSON.parse(line).id)
    } catch {
      // A torn line is kept as it is; it holds no id to skip.
    }
  }
  return ids
}

const byMeasuredAt = (a, b) => a.measuredAt.localeCompare(b.measuredAt)

function withLineEnd(text) {
  return text === '' || text.endsWith('\n') ? text : `${text}\n`
}

/**
 * The history with the rows it does not hold yet appended, each stamped with when and on which
 * Tester run it was recorded (`stamp`: `recordedAt`, `sha`, `phase`).
 */
export function appendDrillDownRows(historyText, rows, stamp) {
  const held = heldIdsOf(historyText)
  const refused = rows
    .map((row) => ({ id: row?.id ?? null, problems: drillDownRowProblems(row) }))
    .filter((entry) => entry.problems.length > 0)
  const fresh = rows
    .filter((row) => drillDownRowProblems(row).length === 0 && !held.has(row.id))
    .sort(byMeasuredAt)
  const lines = fresh.map((row) => `${JSON.stringify({ ...row, ...stamp })}\n`)
  return { text: withLineEnd(historyText) + lines.join(''), added: fresh.length, refused }
}
