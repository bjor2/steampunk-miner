// The status page's Drill speed panel (ticket 434): per stored drill_power step 1, 5, 10, 15 and
// 20, what the drill can cut (the stored-step ladder, drill-ladder.ndjson on test-metrics, from
// src/logging/drillLadderSteps.test.ts) beside what the body achieves going down (the browser
// drill-down run, drill-down.ndjson, from e2e/browser/drillDown.spec.ts), the descent as a share
// of the cut, the gain on the level before, and each one's trend over commits. Pure: the page
// fetches both files, this joins them, drillSpeedHtml.mjs draws it. A level with no run is null,
// never 0.
import { isDrillDownRow, parseHistoryRows } from './drillDown.mjs'

export const DRILL_SPEED_LEVELS = [1, 5, 10, 15, 20]
export const DRILL_SPEED_TREND_RUNS = 20
/** The ladder whose rows count stored steps (drillLadderSteps.test.ts's `SETUP.ladder`). */
export const STORED_STEP_LADDER = 'drill-ladder-steps'
/** A cell is one metre (design doc tile grid), so the ladder's cells/s is its m/s. */
const METRES_PER_CELL = 1
const SHORT_SHA = 9

const byMeasuredAt = (a, b) => a.measuredAt.localeCompare(b.measuredAt)

const isLadderRow = (row) =>
  row?.ladder === STORED_STEP_LADDER &&
  typeof row.measuredAt === 'string' &&
  Number.isSafeInteger(row.level)

const hasHold = (row) => Number.isFinite(row.descentMetres) && row.holdMs > 0

function commitOf(row) {
  const commit = row.buildCommit ?? row.sha
  return commit ? String(commit).slice(0, SHORT_SHA) : null
}

function cutPointOf(row) {
  return {
    commit: commitOf(row),
    sha: row.sha ?? null,
    measuredAt: row.measuredAt,
    value: Number(row.cellsPerSecond) * METRES_PER_CELL,
  }
}

/** Metres toward the planet's centre per second of the hold. */
function descentPointOf(row) {
  return {
    commit: commitOf(row),
    sha: row.sha ?? null,
    measuredAt: row.measuredAt,
    value: row.descentMetres / (row.holdMs / 1000),
  }
}

/**
 * A speed's latest value, the run before it and the change since then, with its trend (the newest
 * points, oldest first), from `points` oldest first; null when there is no point.
 */
export function speedSeriesOf(points) {
  if (points.length === 0) return null
  const latest = points.at(-1)
  const previous = points.at(-2) ?? null
  return {
    latest: latest.value,
    latestPoint: latest,
    previous: previous?.value ?? null,
    change: previous ? latest.value - previous.value : null,
    runCount: points.length,
    trend: points.slice(-DRILL_SPEED_TREND_RUNS),
  }
}

function sortedRowsOf(text, isRow) {
  return parseHistoryRows(text).rows.filter(isRow).sort(byMeasuredAt)
}

function ratioOf(top, bottom) {
  return top === null || bottom === null || bottom === 0 ? null : top / bottom
}

function levelOf(level, ladderRows, runRows) {
  const ladder = ladderRows.filter((row) => row.level === level)
  const runs = runRows.filter((row) => row.drillLevel === level)
  const cut = speedSeriesOf(ladder.map(cutPointOf))
  const descent = speedSeriesOf(runs.map(descentPointOf))
  return {
    level,
    cut,
    descent,
    descentShare: ratioOf(descent?.latest ?? null, cut?.latest ?? null),
    latestLadderRow: ladder.at(-1) ?? null,
  }
}

/** The law's gain is the ladder row's own only when the run cut `from` just before it. */
function lawGainOf(upper, from) {
  const row = upper.latestLadderRow
  return row?.previousLevel === from && row.lawGainOnPrevious !== null
    ? Number(row.lawGainOnPrevious)
    : null
}

function stepOf(lower, upper) {
  return {
    from: lower.level,
    to: upper.level,
    cutGain: ratioOf(upper.cut?.latest ?? null, lower.cut?.latest ?? null),
    lawGain: lawGainOf(upper, lower.level),
    descentGain: ratioOf(upper.descent?.latest ?? null, lower.descent?.latest ?? null),
  }
}

function newestTimeOf(rows) {
  const newest = rows.sort(byMeasuredAt).at(-1)
  return newest ? (newest.recordedAt ?? newest.measuredAt) : null
}

/**
 * The panel's model from the two histories' text (either may be null or empty): `levels` in
 * DRILL_SPEED_LEVELS order, `steps` from each level to the next shown one.
 */
export function readDrillSpeed({ ladderText, drillDownText }) {
  const ladder = sortedRowsOf(ladderText, isLadderRow)
  const runs = sortedRowsOf(drillDownText, (row) => isDrillDownRow(row) && hasHold(row))
  const levels = DRILL_SPEED_LEVELS.map((level) => levelOf(level, ladder, runs))
  return {
    levels,
    steps: levels.slice(1).map((upper, index) => stepOf(levels[index], upper)),
    ladderRunCount: new Set(ladder.map((row) => row.measuredAt)).size,
    drillDownRunCount: runs.length,
    updatedAt: newestTimeOf([...ladder, ...runs]),
  }
}
