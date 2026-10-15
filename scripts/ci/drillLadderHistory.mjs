// The drill ladder's history (ticket 434): one JSON line per level of each run of
// src/logging/drillLadderSteps.test.ts (the #409 ladder cut at stored drill_power steps), kept on
// the `test-metrics` branch as drill-ladder.ndjson and read by the status page's Drill speed panel
// for the cut speed. Append-only and de-duplicated by row id (ndjsonHistory.mjs). The rates stay
// the fixed-point text the ladder's report writes (src/logging/drillLadderReport.ts).
import { appendHistoryRows, fieldProblems } from './ndjsonHistory.mjs'

export const DRILL_LADDER_HISTORY_FILE = 'drill-ladder.ndjson'
export const DRILL_LADDER_ROW_SCHEMA = 1

const STRING_FIELDS = ['id', 'measuredAt', 'ladder']
const WHOLE_FIELDS = ['schema', 'planet', 'worldSeed', 'column', 'level', 'cells', 'ticks']
const DECIMAL_FIELDS = ['seconds', 'cellsPerSecond']
const OPTIONAL_DECIMAL_FIELDS = ['gainOnPrevious', 'lawGainOnPrevious']

const isDecimalText = (value) => typeof value === 'string' && /^\d+(\.\d+)?$/.test(value)
const isDecimalTextOrNull = (value) => value === null || isDecimalText(value)
const isWholeOrNull = (value) => value === null || Number.isSafeInteger(value)

/** What is wrong with a row before it may join the history; empty when nothing is. */
export function drillLadderRowProblems(row) {
  return [
    ...fieldProblems(row, STRING_FIELDS, (value) => typeof value === 'string', 'must be a string'),
    ...fieldProblems(row, WHOLE_FIELDS, Number.isSafeInteger, 'must be a whole number'),
    ...fieldProblems(row, ['previousLevel'], isWholeOrNull, 'must be a whole number or null'),
    ...fieldProblems(row, DECIMAL_FIELDS, isDecimalText, 'must be decimal text'),
    ...fieldProblems(
      row,
      OPTIONAL_DECIMAL_FIELDS,
      isDecimalTextOrNull,
      'must be decimal text or null',
    ),
  ]
}

/** The history with the ladder rows it does not hold yet appended, stamped like the drill-down's. */
export function appendDrillLadderRows(historyText, rows, stamp) {
  return appendHistoryRows(historyText, rows, stamp, drillLadderRowProblems)
}
