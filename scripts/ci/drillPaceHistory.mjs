// The per-purchase drill pace history (ticket 552, #551 section 7 acceptance 5): one JSON line per
// drill power purchase of each seed of src/logging/drillPace.lane.test.ts, {n, D, price, planet,
// minute, income/h}, kept on the `test-metrics` branch as drill-pace.ndjson so a run compares line
// by line with the one before it. Append-only and de-duplicated by row id (ndjsonHistory.mjs). The
// numbers stay the text the lane writes (src/logging/drillPace.ts): D, minute and income/h fixed
// point, the price a canonical Money string.
import { appendHistoryRows, fieldProblems } from './ndjsonHistory.mjs'

export const DRILL_PACE_HISTORY_FILE = 'drill-pace.ndjson'
export const DRILL_PACE_ROW_SCHEMA = 1

const STRING_FIELDS = ['id', 'measuredAt']
const WHOLE_FIELDS = ['schema', 'worldSeed', 'n', 'planet']
const DECIMAL_FIELDS = ['d', 'minute', 'incomePerHour']

const isDecimalText = (value) => typeof value === 'string' && /^\d+(\.\d+)?$/.test(value)
const isMoneyText = (value) =>
  typeof value === 'string' && /^(0|[1-9][0-9]*)(\.[0-9]+)?(e[+-]?[0-9]+)?$/.test(value)

/** What is wrong with a row before it may join the history; empty when nothing is. */
export function drillPaceRowProblems(row) {
  return [
    ...fieldProblems(row, STRING_FIELDS, (value) => typeof value === 'string', 'must be a string'),
    ...fieldProblems(row, WHOLE_FIELDS, Number.isSafeInteger, 'must be a whole number'),
    ...fieldProblems(row, DECIMAL_FIELDS, isDecimalText, 'must be decimal text'),
    ...fieldProblems(row, ['price'], isMoneyText, 'must be Money text'),
    ...fieldProblems(
      row,
      ['isOnePlanetInterval'],
      (value) => typeof value === 'boolean',
      'must be true or false',
    ),
  ]
}

/** The history with the purchase rows it does not hold yet appended, stamped like the ladder's. */
export function appendDrillPaceRows(historyText, rows, stamp) {
  return appendHistoryRows(historyText, rows, stamp, drillPaceRowProblems)
}
