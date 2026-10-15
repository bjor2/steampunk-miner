// The Tests tab's drill-down panel (ticket 416): reads drill-down.ndjson from the test-metrics
// branch (one row per browser run of e2e/browser/drillDown.spec.ts, scripts/ci/drillDownHistory.mjs)
// into the latest run per drill level with its trend over commits, and the newest runs. Pure: the
// page fetches the text, this shapes it, drillDownHtml.mjs draws it.

export const DRILL_DOWN_HISTORY_ROWS = 20
export const DRILL_DOWN_TREND_RUNS = 20

function rowsOfText(text) {
  const rows = []
  let skipped = 0
  for (const line of String(text ?? '').split('\n')) {
    if (!line.trim()) continue
    try {
      rows.push(JSON.parse(line))
    } catch {
      skipped += 1
    }
  }
  return { rows, skipped }
}

const isRunRow = (row) =>
  typeof row?.measuredAt === 'string' && Number.isSafeInteger(row.drillLevel)
const byMeasuredAt = (a, b) => a.measuredAt.localeCompare(b.measuredAt)

function trendPointOf(row) {
  return {
    commit: row.buildCommit ?? null,
    measuredAt: row.measuredAt,
    value: row.depthGainedTiles,
  }
}

function levelOf(level, rows) {
  const runs = rows.filter((row) => row.drillLevel === level)
  return {
    level,
    latest: runs.at(-1),
    previous: runs.at(-2) ?? null,
    runCount: runs.length,
    trend: runs.slice(-DRILL_DOWN_TREND_RUNS).map(trendPointOf),
  }
}

function levelsOf(rows) {
  const levels = [...new Set(rows.map((row) => row.drillLevel))].sort((a, b) => a - b)
  return levels.map((level) => levelOf(level, rows))
}

/** The panel's model, or `{ error }` when the history holds no run yet. */
export function readDrillDownRuns(text) {
  const { rows: parsed, skipped } = rowsOfText(text)
  const rows = parsed.filter(isRunRow).sort(byMeasuredAt)
  if (rows.length === 0) return { error: 'no drill-down run recorded yet' }
  const newest = rows.at(-1)
  return {
    runCount: rows.length,
    skipped: skipped + parsed.length - rows.length,
    updatedAt: newest.recordedAt ?? newest.measuredAt,
    levels: levelsOf(rows),
    history: rows.slice(-DRILL_DOWN_HISTORY_ROWS).reverse(),
  }
}
