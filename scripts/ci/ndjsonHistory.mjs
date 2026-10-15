// An append-only NDJSON history on the `test-metrics` branch (drill-down.ndjson, ticket 416;
// drill-ladder.ndjson, ticket 434), following docs/perf/history.ndjson: a row is never rewritten,
// and a row already held (same id) is skipped, because the Tester records after every phase and a
// push retry writes the record again on a fresh checkout.

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
 * The history with the rows it does not hold yet appended in measured order, each stamped with
 * when and on which Tester run it was recorded (`stamp`: `recordedAt`, `sha`, `phase`). A row
 * `problemsOf` finds fault with is refused with its problems.
 */
export function appendHistoryRows(historyText, rows, stamp, problemsOf) {
  const held = heldIdsOf(historyText)
  const refused = rows
    .map((row) => ({ id: row?.id ?? null, problems: problemsOf(row) }))
    .filter((entry) => entry.problems.length > 0)
  const fresh = rows
    .filter((row) => problemsOf(row).length === 0 && !held.has(row.id))
    .sort(byMeasuredAt)
  const lines = fresh.map((row) => `${JSON.stringify({ ...row, ...stamp })}\n`)
  return { text: withLineEnd(historyText) + lines.join(''), added: fresh.length, refused }
}

/** The names of `fields` whose value `isValid` refuses, each with the rule it broke. */
export function fieldProblems(row, fields, isValid, rule, prefix = '') {
  return fields.filter((name) => !isValid(row?.[name])).map((name) => `${prefix}${name} ${rule}`)
}
