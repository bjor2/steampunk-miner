// Appends the drill-down rows of this checkout's last browser run (ticket 416) to drill-down.ndjson
// in a checkout of the `test-metrics` branch. Run by pushTestMetrics.sh after recordTestRun.mjs,
// so every box Tester record (slow phase, probes, nightly e2e) carries the runs it found; with no
// rows it changes nothing.
//
//   METRICS_DIR=<checkout> GITHUB_SHA=<sha> TEST_PHASE=<phase> node scripts/ci/recordDrillDown.mjs
//
// The rows are the files e2e/browser/drillDown.spec.ts writes under test-results/drill-down/
// (DRILL_DOWN_ROWS_DIR overrides it). Never fails the caller: problems are printed and skipped.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { appendDrillDownRows, DRILL_DOWN_HISTORY_FILE } from './drillDownHistory.mjs'

const ROWS_DIR = resolve(process.env.DRILL_DOWN_ROWS_DIR || 'test-results/drill-down')

function readRowFiles(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .flatMap((name) => {
      try {
        return [JSON.parse(readFileSync(join(dir, name), 'utf8'))]
      } catch (error) {
        console.log(`drill-down: skipped ${name}: ${error.message}`)
        return []
      }
    })
}

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

function printRefusals(refused) {
  for (const entry of refused) {
    console.log(`drill-down: refused ${entry.id}: ${entry.problems.join('; ')}`)
  }
}

function writeHistoryWhenGrown(path, outcome) {
  if (outcome.added > 0) writeFileSync(path, outcome.text)
}

function recordDrillDownRows() {
  const rows = readRowFiles(ROWS_DIR)
  if (rows.length === 0 || !process.env.METRICS_DIR) return
  const path = join(process.env.METRICS_DIR, DRILL_DOWN_HISTORY_FILE)
  const outcome = appendDrillDownRows(readHistory(path), rows, stampOf(process.env))
  printRefusals(outcome.refused)
  writeHistoryWhenGrown(path, outcome)
  console.log(
    `drill-down: ${outcome.added} new of ${rows.length} rows -> ${DRILL_DOWN_HISTORY_FILE}`,
  )
}

recordDrillDownRows()
