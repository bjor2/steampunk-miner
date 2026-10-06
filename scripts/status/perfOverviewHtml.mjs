// Renders the Performance tab of /status/ from the model of perfOverview.mjs as static HTML
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
    `<div class="meta perf-meta"><b>${model.runCount}</b> runs · <b>${model.metricCount}</b> metrics · ${latestRunHtml(model)}</div>` +
    `<div class="meta perf-meta">Data: <code>docs/perf/history.ndjson</code> and <code>docs/perf/metrics.json</code> (<a href="${escapeHtml(readme)}">docs/perf/README.md</a>). ` +
    'Update: <code>npm run perf:record -- --source bench</code>, then commit <code>docs/perf/history.ndjson</code>.</div>'
  )
}

function cardHtml(value, label, cls = '') {
  return `<div class="card"><div class="n ${cls}">${value}</div><div class="l">${escapeHtml(label)}</div></div>`
}

// The page's script turns the stamp into the reader's local time and age (no clock here).
function timeHtml(iso) {
  return iso
    ? `<time class="perf-ago" datetime="${escapeHtml(iso)}">${escapeHtml(formatStamp(iso))}</time>`
    : '—'
}

function cardsHtml(model) {
  const { total, over, within } = model.budgetCounts
  return (
    '<div class="cards perf-cards">' +
    cardHtml(over, 'over budget', over ? 'bad' : 'ok') +
    cardHtml(within, `within budget (of ${total})`, 'ok') +
    cardHtml(model.metricCount, 'metrics') +
    cardHtml(model.runCount, 'runs') +
    `<div class="card"><div class="n perf-last">${timeHtml(model.latestRun?.measuredAt)}</div><div class="l">last measured</div></div>` +
    '</div>'
  )
}

function headroomHtml(row) {
  if (row.headroomPercent === null) {
    return `<span class="${row.overBudget ? 'bad' : 'muted'}">${row.overBudget ? 'over' : '—'}</span>`
  }
  const text = row.overBudget
    ? `${formatMetricValue(Math.abs(row.headroomPercent / 100) + 1)}× budget`
    : `${row.headroomPercent.toFixed(0)}% left`
  return `<span class="${row.overBudget ? 'bad' : row.headroomPercent < 15 ? 'warn' : 'ok'}">${escapeHtml(text)}</span>`
}

function budgetRowHtml(row, repo) {
  const prev = row.deltaFromPrevious
  const trend = !prev
    ? '<span class="muted">—</span>'
    : `<span class="${prev.direction === 'good' ? 'ok' : prev.direction === 'bad' ? 'bad' : 'muted'}">${escapeHtml(signed(withUnit(prev.absolute, row.unit)))}${prev.percent === null ? '' : ` (${escapeHtml(signed(prev.percent.toFixed(PERCENT_DECIMALS)))}%)`}</span>`
  const verdict = row.overBudget
    ? '<span class="badge st-blocked">over</span>'
    : '<span class="badge st-working">pass</span>'
  return (
    `<tr data-metric="${escapeHtml(row.id)}">` +
    `<td><a href="#${escapeHtml(row.figureId)}">${escapeHtml(row.label)}</a></td>` +
    `<td class="num-r">${escapeHtml(withUnit(row.latest, row.unit))}</td>` +
    `<td class="num-r muted">${row.better === 'lower' ? '≤' : '≥'} ${escapeHtml(withUnit(row.budget, row.unit))}</td>` +
    `<td>${headroomHtml(row)}</td>` +
    `<td>${trend}</td>` +
    `<td class="muted" title="runs of this metric over its budget">${row.runsOverBudget}/${row.runCount}</td>` +
    `<td>${verdict} <a class="mono muted" href="${escapeHtml(commitUrlOf(repo, row.latestRun.commit))}">${escapeHtml(row.latestRun.shortSha)}</a></td>` +
    '</tr>'
  )
}

function budgetsHtml(model) {
  if (model.budgets.length === 0) {
    return '<div class="sub"><h2>Budgets</h2><div class="muted">No metric has a budget in metrics.json.</div></div>'
  }
  return (
    '<div class="sub"><h2>Budgets</h2><table class="perf-budgets"><thead><tr>' +
    '<th>Metric</th><th>Latest</th><th>Budget</th><th>Headroom</th><th>vs prev run</th><th>Runs over</th><th>Verdict</th>' +
    `</tr></thead><tbody>${model.budgets.map((row) => budgetRowHtml(row, model.repo)).join('')}</tbody></table></div>`
  )
}

function recentRunHtml(run, repo) {
  const over = run.overBudget.length
    ? `<span class="bad" title="${escapeHtml(run.overBudget.join(', '))}">${run.overBudget.length} over budget</span>`
    : ''
  const note = [run.note, run.env].filter(Boolean).join(' · ')
  return (
    '<tr>' +
    `<td class="muted">${timeHtml(run.measuredAt)}</td>` +
    `<td><a class="mono" href="${escapeHtml(commitUrlOf(repo, run.commit))}">${escapeHtml(run.shortSha)}</a></td>` +
    `<td>${escapeHtml(run.source)}</td>` +
    `<td class="num-r muted">${run.load === null ? '—' : escapeHtml(formatMetricValue(run.load))}</td>` +
    `<td class="num-r">${run.metricCount}</td>` +
    `<td>${over}${over && note ? ' · ' : ''}<span class="muted perf-run-note">${escapeHtml(note)}</span></td>` +
    '</tr>'
  )
}

function recentRunsHtml(model) {
  if (model.recentRuns.length === 0) return ''
  return (
    '<div class="sub"><h2>Recent runs</h2><table class="perf-runs"><thead><tr>' +
    '<th>Measured</th><th>Commit</th><th>Source</th><th>Load</th><th>Metrics</th><th>Notes</th>' +
    `</tr></thead><tbody>${model.recentRuns.map((run) => recentRunHtml(run, model.repo)).join('')}</tbody></table></div>`
  )
}

function problemsHtml(problems) {
  if (problems.length === 0) return ''
  return `<ul class="list perf-problems warn">${problems.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>`
}

// The chart panel carries the numbers the page's tab badge shows, so the badge needs no fetch.
function chartsSectionHtml(model, body) {
  const { total, over } = model.budgetCounts
  const data =
    `data-budgets="${total}" data-over="${over}" data-runs="${model.runCount}"` +
    ` data-last-measured="${escapeHtml(model.latestRun?.measuredAt ?? '')}"`
  return `<section class="panel" id="perf-panel" ${data}>${body}</section>`
}

/** The Performance tab for a model from `buildPerfOverview`: a summary panel, then the charts. */
export function renderPerfOverview(model) {
  const groups = model.groups.map((group) => groupHtml(group, model.repo)).join('')
  const empty =
    model.groups.length === 0 ? '<div class="muted">No measurement recorded yet.</div>' : ''
  const summary =
    '<section class="panel" id="perf-summary-panel"><h2>Performance</h2>' +
    cardsHtml(model) +
    headerHtml(model) +
    problemsHtml(model.problems) +
    budgetsHtml(model) +
    recentRunsHtml(model) +
    '</section>'
  return summary + chartsSectionHtml(model, '<h2>Charts</h2>' + groups + empty)
}

/** The section when the model could not be built: the rest of the dashboard still renders. */
export function renderPerfOverviewFailure(message) {
  return `<section class="panel" id="perf-panel" data-error="1"><h2>Performance</h2><div class="bad">Performance overview failed to build: ${escapeHtml(message)}</div></section>`
}
