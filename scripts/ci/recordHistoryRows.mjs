// Appends a history's new rows to its NDJSON file in a checkout of the `test-metrics` branch
// (METRICS_DIR), stamped with the Tester run (GITHUB_SHA, TEST_PHASE). Shared by
// recordDrillDown.mjs (ticket 416) and recordDrillLadder.mjs (ticket 434). Never fails the
// caller: problems are printed and skipped, and with no rows nothing changes.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

function readHistory(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

function stampOf(env) {
  return {
    recordedAt: new Date().toISOString(),
    sha: env.GITHUB_SHA || null,
    phase: env.TEST_PHASE || null,
  }
}

function printRefusals(label, refused) {
  for (const entry of refused) {
    console.log(`${label}: refused ${entry.id}: ${entry.problems.join('; ')}`)
  }
}

function writeHistoryWhenGrown(path, outcome) {
  if (outcome.added > 0) writeFileSync(path, outcome.text)
}

/** `append(historyText, rows, stamp)` is the history's pure append (drillDownHistory.mjs etc.). */
export function recordHistoryRows({ label, rows, fileName, append, env = process.env }) {
  if (rows.length === 0 || !env.METRICS_DIR) return
  const path = join(env.METRICS_DIR, fileName)
  const outcome = append(readHistory(path), rows, stampOf(env))
  printRefusals(label, outcome.refused)
  writeHistoryWhenGrown(path, outcome)
  console.log(`${label}: ${outcome.added} new of ${rows.length} rows -> ${fileName}`)
}
