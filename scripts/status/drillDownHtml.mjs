// Draws the Tests tab's drill-down panel (ticket 416) from the model of drillDown.mjs: the latest
// run per drill level with a sparkline of depth gained over commits, then the newest runs. It
// watches and does not judge, so nothing here is coloured as a pass or a failure. Static HTML
// strings; classes come from scripts/status/index.html.
import { escapeHtml } from './perfOverviewHtml.mjs'
import { ageOf } from './slotsHtml.mjs'

const SPARK = { width: 90, height: 18, pad: 2 }
const SPEC_FILE = 'e2e/browser/drillDown.spec.ts'

const round1 = (value) => Math.round(value * 10) / 10
const numberText = (value, digits = 2) => (Number.isFinite(value) ? value.toFixed(digits) : '—')

function spotText(spot) {
  if (!spot) return '—'
  return `(${numberText(spot.x, 1)}, ${numberText(spot.y, 1)}) · ${spot.depthTiles} deep`
}

function commitLink(row, view) {
  const commit = row.sha ?? row.buildCommit
  if (!commit || commit === 'unknown') return '<span class="muted">—</span>'
  const label = escapeHtml(String(row.buildCommit ?? commit).slice(0, 9))
  return `<a class="mono" href="https://github.com/${escapeHtml(view.repo)}/commit/${escapeHtml(commit)}">${label}</a>`
}

function whenText(row, view) {
  return `<span title="${escapeHtml(row.measuredAt)}">${ageOf(row.measuredAt, view.nowMs)}</span>`
}

function changeText(level) {
  if (!level.previous) return ''
  const change = level.latest.depthGainedTiles - level.previous.depthGainedTiles
  const sign = change > 0 ? '+' : ''
  return ` <span class="muted" title="against the run before">(${sign}${change})</span>`
}

function sparkPointOf(value, index, count, max) {
  const x = SPARK.pad + (index * (SPARK.width - 2 * SPARK.pad)) / Math.max(1, count - 1)
  const y = SPARK.height - SPARK.pad - (value * (SPARK.height - 2 * SPARK.pad)) / Math.max(1, max)
  return [round1(x), round1(y)]
}

// A lone run is a dot; two or more are a line.
function sparkMarkOf(points) {
  if (points.length === 1) return `<circle cx="${points[0][0]}" cy="${points[0][1]}" r="1.5"/>`
  return `<polyline points="${points.map((point) => point.join(',')).join(' ')}"/>`
}

/**
 * A sparkline of `trend` (`{ commit, value }` points, oldest left) from 0 to its largest value; the
 * title lists each point's commit and `valueText(value)`. Shared with the Drill speed panel.
 */
export function trendSvg(trend, valueText) {
  const max = Math.max(0, ...trend.map((point) => point.value))
  const points = trend.map((point, index) => sparkPointOf(point.value, index, trend.length, max))
  const title = trend.map((point) => `${point.commit ?? '—'}: ${valueText(point.value)}`).join('\n')
  const mark = sparkMarkOf(points)
  return `<svg class="te-spark" viewBox="0 0 ${SPARK.width} ${SPARK.height}" width="${SPARK.width}" height="${SPARK.height}" role="img"><title>${escapeHtml(title)}</title>${mark}</svg>`
}

/** Depth gained per run, oldest left; the title lists each run's commit and depth. */
export function depthTrendSvg(trend) {
  return trendSvg(trend, (value) => `${value} cells`)
}

function latestRow(level, view) {
  const row = level.latest
  return `<tr><td>${level.level}</td><td>${commitLink(row, view)}</td><td>${whenText(row, view)}</td><td>${spotText(row.start)}</td><td>${spotText(row.end)}</td><td><b>${row.depthGainedTiles}</b> cells${changeText(level)}</td><td>${numberText(row.cellsPerSecond)}</td><td>${numberText(row.speedMetresPerSecond)}</td><td>${depthTrendSvg(level.trend)} <span class="muted">${level.runCount} runs</span></td></tr>`
}

function latestSection(model, view) {
  const rows = model.levels.map((level) => latestRow(level, view)).join('')
  return `<table class="sl-table"><thead><tr><th>Drill level</th><th>Commit</th><th>When</th><th>Start (x, y) · depth</th><th>End (x, y) · depth</th><th>Depth in 10 s</th><th>cells/s</th><th>m/s</th><th>Depth trend over commits</th></tr></thead><tbody>${rows}</tbody></table>`
}

function historyRow(row, view) {
  return `<tr><td>${whenText(row, view)}</td><td>${commitLink(row, view)}</td><td>${row.drillLevel}</td><td>${spotText(row.start)}</td><td>${spotText(row.end)}</td><td>${row.depthGainedTiles}</td><td>${numberText(row.cellsPerSecond)}</td><td>${numberText(row.speedMetresPerSecond)}</td><td>${row.ticks} in ${numberText(row.holdMs / 1000, 1)} s</td><td>${escapeHtml(row.phase ?? '—')}</td></tr>`
}

function historySection(model, view) {
  const rows = model.history.map((row) => historyRow(row, view)).join('')
  return `<details><summary>Newest ${model.history.length} of ${model.runCount} runs</summary>
    <table class="sl-table"><thead><tr><th>When</th><th>Commit</th><th>Level</th><th>Start</th><th>End</th><th>Depth gained</th><th>cells/s</th><th>m/s</th><th>Ticks</th><th>Tester phase</th></tr></thead><tbody>${rows}</tbody></table></details>`
}

function headingOf(view) {
  const spec = `<a class="mono" href="https://github.com/${escapeHtml(view.repo)}/blob/main/${SPEC_FILE}">${SPEC_FILE}</a>`
  return `<h3>Drill-down run <span class="muted">real Down key held 10 s on the P1 surface, seed 83921 · ${spec} · watched, not judged (#409 owns the ladder)</span></h3>`
}

/** The panel; `view` carries `repo` (`owner/name`) and `nowMs`. */
export function renderDrillDown(model, view) {
  const skipped = model.skipped ? ` · ${model.skipped} unreadable lines skipped` : ''
  return `<section class="te-wide" id="drill-down-runs">${headingOf(view)}
    <div class="muted">drill-down.ndjson on test-metrics, written by the box Tester (slow tier and nightly) · updated ${ageOf(model.updatedAt, view.nowMs)}${skipped}</div>
    ${latestSection(model, view)}${historySection(model, view)}</section>`
}

/** The panel when the history is missing or holds no run yet. */
export function renderDrillDownFailure(message, view) {
  return `<section class="te-wide" id="drill-down-runs">${headingOf(view)}<div class="muted">No runs to show: ${escapeHtml(message)}</div></section>`
}
