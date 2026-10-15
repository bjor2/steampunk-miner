// Appends the stored-step drill ladder's rows of this checkout's last Vitest run (ticket 434) to
// drill-ladder.ndjson in a checkout of the `test-metrics` branch. Run by pushTestMetrics.sh beside
// recordDrillDown.mjs, so any Tester record made after src/logging/drillLadderSteps.test.ts ran
// carries its rows; a run already recorded is skipped by row id, and with no file nothing changes.
//
//   METRICS_DIR=<checkout> GITHUB_SHA=<sha> TEST_PHASE=<phase> node scripts/ci/recordDrillLadder.mjs
//
// The rows are the lines the spec writes to balance-report/drill-ladder-steps.ndjson
// (DRILL_LADDER_ROWS_FILE overrides it). Never fails the caller: problems are printed and skipped.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { appendDrillLadderRows, DRILL_LADDER_HISTORY_FILE } from './drillLadderHistory.mjs'
import { recordHistoryRows } from './recordHistoryRows.mjs'

const ROWS_FILE = resolve(
  process.env.DRILL_LADDER_ROWS_FILE || 'balance-report/drill-ladder-steps.ndjson',
)

function readRowLines(path) {
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .flatMap((line) => {
      try {
        return [JSON.parse(line)]
      } catch (error) {
        console.log(`drill-ladder: skipped a torn line: ${error.message}`)
        return []
      }
    })
}

recordHistoryRows({
  label: 'drill-ladder',
  rows: readRowLines(ROWS_FILE),
  fileName: DRILL_LADDER_HISTORY_FILE,
  append: appendDrillLadderRows,
})
