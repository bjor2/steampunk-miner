// Renders the Performance section of /status/ from the model of perfOverview.mjs as static HTML
// with inline SVG, so `curl` of the live page shows the charts and nothing needs JavaScript.
// Classes and colours come from the page's own style sheet (scripts/status/index.html).

// The SVG viewBox every chart shares; the figure's CSS scales it to the column width.
const CHART = { width: 320, height: 150, left: 40, right: 12, top: 14, bottom: 22 }
// The first and last points sit this far inside the plot, so their sha labels are not clipped.
const POINT_INSET = 22
// A gridline label this close to the budget's axis label gives way to it.
const LABEL_CLEARANCE = 10
const POINT_RADIUS = 4
const MAX_X_LABELS = 6
const PERCENT_DECIMALS = 1

export function escapeHtml(text) {
  return String(text ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )
}

/** A metric value for the eye: whole numbers as they are, otherwise up to three decimals. */
export function formatMetricValue(value) {
  if (Number.isInteger(value)) return String(value)
  const decimals = Math.abs(value) >= 100 ? 1 : Math.abs(value) >= 10 ? 2 : 3
  return String(Number(value.toFixed(decimals)))
}

function withUnit(value, unit) {
  const text = formatMetricValue(value)
  return unit ? `${text} ${unit}` : text
}

function signed(text) {
  return text.startsWith('-') ? text.replace('-', '−') : `+${text}`
}

/** `2026-10-05T23:37:24+02:00` -> `2026-10-05 23:37 +02:00`: the measuring machine's own clock. */
export function formatStamp(iso) {
  if (!iso) return '—'
  const match =
    /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(iso)
  if (!match) return iso
  const zone = match[3] === 'Z' ? 'UTC' : (match[3] ?? '')
  return `${match[1]} ${match[2]}${zone ? ` ${zone}` : ''}`
}

function commitUrlOf(repo, commit) {
  return `https://github.com/${repo}/commit/${commit}`
}

function plotWidth() {
  return CHART.width - CHART.left - CHART.right
}

function plotHeight() {
  return CHART.height - CHART.top - CHART.bottom
}

// One point sits in the middle of the plot, so a single measurement still looks intentional.
function xOf(index, count) {
  if (count === 1) return CHART.left + plotWidth() / 2
  return CHART.left + POINT_INSET + ((plotWidth() - 2 * POINT_INSET) * index) / (count - 1)
}

function yOf(value, yMax) {
  return CHART.top + plotHeight() * (1 - value / yMax)
}

function round(n) {
  return Math.round(n * 10) / 10
}

function axisLabelSvg(cls, y, text) {
  return `<text class="${cls}" x="${CHART.left - 4}" y="${y + 3}" text-anchor="end">${escapeHtml(text)}</text>`
}

function isNearBudgetLabel(y, chart) {
  return chart.budget !== null && Math.abs(y - yOf(chart.budget, chart.yMax)) < LABEL_CLEARANCE
}

function gridlineSvg(value, chart) {
  const y = round(yOf(value, chart.yMax))
  const label = isNearBudgetLabel(y, chart)
    ? ''
    : axisLabelSvg('perf-axis-text', y, formatMetricValue(value))
  return (
    `<line class="perf-grid" x1="${CHART.left}" x2="${CHART.width - CHART.right}" y1="${y}" y2="${y}"/>` +
    label
  )
}

function gridlinesSvg(chart) {
  return [0, chart.yMax / 2, chart.yMax].map((value) => gridlineSvg(value, chart)).join('')
}

function budgetSvg(chart) {
  if (chart.budget === null) return ''
  const y = round(yOf(chart.budget, chart.yMax))
  const right = CHART.width - CHART.right
  // The budget's value is an axis label in the budget colour: inside the plot it would cover
  // the points that sit near it, which are the ones that matter.
  return (
    `<line class="perf-budget" x1="${CHART.left}" x2="${right}" y1="${y}" y2="${y}"><title>budget ${escapeHtml(withUnit(chart.budget, chart.unit))}</title></line>` +
    axisLabelSvg('perf-budget-text', y, formatMetricValue(chart.budget))
  )
}

function lineSvg(chart) {
  if (chart.points.length < 2) return ''
  const coords = chart.points.map(
    (p, i) => `${round(xOf(i, chart.points.length))},${round(yOf(p.value, chart.yMax))}`,
  )
  return `<polyline class="perf-line" points="${coords.join(' ')}"/>`
}

function pointTitleOf(point, unit) {
  const parts = [
    point.shortSha,
    formatStamp(point.committedAt),
    point.source,
    withUnit(point.value, unit),
    point.load === null ? 'load —' : `load ${formatMetricValue(point.load)}`,
  ]
  return parts.join(' · ')
}

function pointSvg(point, index, chart, repo) {
  const cx = round(xOf(index, chart.points.length))
  const cy = round(yOf(point.value, chart.yMax))
  const cls = point.overBudget ? 'perf-point over' : 'perf-point'
  return (
    `<a href="${escapeHtml(commitUrlOf(repo, point.commit))}">` +
    `<circle class="${cls}" cx="${cx}" cy="${cy}" r="${POINT_RADIUS}"><title>${escapeHtml(pointTitleOf(point, chart.unit))}</title></circle></a>`
  )
}

function pointsSvg(chart, repo) {
  return chart.points.map((point, index) => pointSvg(point, index, chart, repo)).join('')
}

// Every nth sha when there are many, the last one always, and none crowding the last.
function isXLabelShown(index, count) {
  const step = Math.ceil(count / MAX_X_LABELS)
  if (index === count - 1) return true
  return index % step === 0 && count - 1 - index >= step
}

function xLabelsSvg(chart) {
  const count = chart.points.length
  return chart.points
    .map((point, index) =>
      isXLabelShown(index, count)
        ? `<text class="perf-axis-text" x="${round(xOf(index, count))}" y="${CHART.height - 7}" text-anchor="middle">${escapeHtml(point.shortSha)}</text>`
        : '',
    )
    .join('')
}

function chartSvg(chart, repo) {
  return (
    `<svg viewBox="0 0 ${CHART.width} ${CHART.height}" role="img" aria-label="${escapeHtml(chart.label)} over commits">` +
    gridlinesSvg(chart) +
    budgetSvg(chart) +
    lineSvg(chart) +
    pointsSvg(chart, repo) +
    xLabelsSvg(chart) +
    '</svg>'
  )
}

function deltaHtml(name, delta, unit) {
  if (!delta) return `<span class="perf-delta muted">vs ${name} —</span>`
  const cls = delta.direction === 'good' ? 'ok' : delta.direction === 'bad' ? 'bad' : 'muted'
  const percent =
    delta.percent === null ? '' : ` (${signed(delta.percent.toFixed(PERCENT_DECIMALS))}%)`
  return `<span class="perf-delta ${cls}">vs ${name} ${escapeHtml(signed(withUnit(delta.absolute, unit)))}${escapeHtml(percent)}</span>`
}

function budgetStatusHtml(chart) {
  if (chart.budget === null) return ''
  const text = chart.latestOverBudget ? 'over budget' : 'within budget'
  const cls = chart.latestOverBudget ? 'bad' : 'ok'
  return `<span class="perf-delta ${cls}">${text} ${escapeHtml(withUnit(chart.budget, chart.unit))}</span>`
}

function chartNotesHtml(chart) {
  const notes = []
  if (!chart.registered) notes.push('not in metrics.json: add a label, unit, group and budget')
  if (chart.source) notes.push(chart.source)
  return notes.length
    ? `<div class="perf-note muted">${notes.map(escapeHtml).join(' · ')}</div>`
    : ''
}

function captionHtml(chart) {
  return (
    '<figcaption>' +
    `<div class="perf-label">${escapeHtml(chart.label)}${chart.unit ? ` <span class="muted">(${escapeHtml(chart.unit)})</span>` : ''}</div>` +
    `<div class="perf-latest">${escapeHtml(withUnit(chart.latest, chart.unit))}</div>` +
    `<div class="perf-deltas">${deltaHtml('prev', chart.deltaFromPrevious, chart.unit)} ${deltaHtml('first', chart.deltaFromFirst, chart.unit)} ${budgetStatusHtml(chart)}</div>` +
    '</figcaption>'
  )
}

function chartHtml(chart, repo) {
  const cls = chart.registered ? 'perf-chart' : 'perf-chart unregistered'
  return (
    `<figure class="${cls}" id="${escapeHtml(chart.figureId)}" data-metric="${escapeHtml(chart.id)}">` +
    captionHtml(chart) +
    chartSvg(chart, repo) +
    chartNotesHtml(chart) +
    '</figure>'
  )
}

function groupHtml(group, repo) {
  return (
    `<div class="sub perf-group"><h2>${escapeHtml(group.name)}</h2>` +
    `<div class="perf-charts">${group.charts.map((chart) => chartHtml(chart, repo)).join('')}</div></div>`
  )
}

function latestRunHtml(model) {
  const run = model.latestRun
  if (!run) return 'no runs yet'
  const hover = [run.machine, run.env, run.note].filter(Boolean).join(' · ')
  return (
    `latest <a href="${escapeHtml(commitUrlOf(model.repo, run.commit))}" class="mono">${escapeHtml(run.shortSha)}</a> ` +
    `<span title="${escapeHtml(hover)}">measured ${escapeHtml(formatStamp(run.measuredAt))} · ${escapeHtml(run.source)}</span>` +
    (hover ? `<div class="perf-env muted">${escapeHtml(hover)}</div>` : '')
  )
}

function headerHtml(model) {
  const readme = `https://github.com/${model.repo}/blob/main/docs/perf/README.md`
  return (
    '<h2>Performance</h2>' +
    `<div class="meta perf-meta"><b>${model.runCount}</b> runs · <b>${model.metricCount}</b> metrics · ${latestRunHtml(model)}</div>` +
    `<div class="meta perf-meta">Charts come from <code>docs/perf/history.ndjson</code> and <code>docs/perf/metrics.json</code> (<a href="${escapeHtml(readme)}">docs/perf/README.md</a>). ` +
    'Update: <code>npm run perf:record -- --source bench</code>, then commit <code>docs/perf/history.ndjson</code>.</div>'
  )
}

function problemsHtml(problems) {
  if (problems.length === 0) return ''
  return `<ul class="list perf-problems warn">${problems.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>`
}

function sectionHtml(body) {
  return `<section class="panel" id="perf-panel">${body}</section>`
}

/** The whole section for a model from `buildPerfOverview`. */
export function renderPerfOverview(model) {
  const groups = model.groups.map((group) => groupHtml(group, model.repo)).join('')
  const empty =
    model.groups.length === 0 ? '<div class="muted">No measurement recorded yet.</div>' : ''
  return sectionHtml(headerHtml(model) + problemsHtml(model.problems) + groups + empty)
}

/** The section when the model could not be built: the rest of the dashboard still renders. */
export function renderPerfOverviewFailure(message) {
  return sectionHtml(
    `<h2>Performance</h2><div class="bad">Performance overview failed to build: ${escapeHtml(message)}</div>`,
  )
}
