// The drill-down run's history (ticket 416): one JSON line per browser run of
// e2e/browser/drillDown.spec.ts, kept on the `test-metrics` branch as drill-down.ndjson and shown
// on the status page's Tests tab and its Drill speed panel. Append-only and de-duplicated by row id
// (ndjsonHistory.mjs).
import { appendHistoryRows, fieldProblems } from './ndjsonHistory.mjs'

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

/**
 * The history with the rows it does not hold yet appended, each stamped with when and on which
 * Tester run it was recorded (`stamp`: `recordedAt`, `sha`, `phase`).
 */
export function appendDrillDownRows(historyText, rows, stamp) {
  return appendHistoryRows(historyText, rows, stamp, drillDownRowProblems)
}
