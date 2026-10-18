// Appends the per-purchase drill pace rows of this checkout's last lane run (ticket 552) to
// drill-pace.ndjson in a checkout of the `test-metrics` branch. Run by pushTestMetrics.sh beside
// recordDrillLadder.mjs, so a Tester record made after src/logging/drillPace.lane.test.ts ran
// carries its rows; a run already recorded is skipped by row id, and with no file nothing changes.
//
//   METRICS_DIR=<checkout> GITHUB_SHA=<sha> TEST_PHASE=<phase> node scripts/ci/recordDrillPace.mjs
//
// The rows are the lines the lane writes to balance-report/drill-pace.ndjson (DRILL_PACE_ROWS_FILE
// overrides it). Never fails the caller: problems are printed and skipped.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { appendDrillPaceRows, DRILL_PACE_HISTORY_FILE } from './drillPaceHistory.mjs'
import { recordHistoryRows } from './recordHistoryRows.mjs'

const ROWS_FILE = resolve(process.env.DRILL_PACE_ROWS_FILE || 'balance-report/drill-pace.ndjson')

function readRowLines(path) {
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .flatMap((line) => {
      try {
        return [JSON.parse(line)]
      } catch (error) {
        console.log(`drill-pace: skipped a torn line: ${error.message}`)
        return []
      }
    })
}

recordHistoryRows({
  label: 'drill-pace',
  rows: readRowLines(ROWS_FILE),
  fileName: DRILL_PACE_HISTORY_FILE,
  append: appendDrillPaceRows,
})
