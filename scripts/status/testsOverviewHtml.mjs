// Renders the Tests tab's test list (#192) from the model of testsOverview.mjs: which run the list
// comes from, the counts, each feature's total with its trend, the slowest tests, the filter bar
// and every test with its feature, status, duration, a sparkline over the recorded runs and a link
// to its file at the run's commit. Static HTML strings; the page re-renders the list part alone
// while the filter bar keeps focus. Classes come from scripts/status/index.html.
import { escapeHtml } from './perfOverviewHtml.mjs'
import { ageOf } from './slotsHtml.mjs'
import { SORTS, STATUS_FILTERS, testsQueryParams } from './testsOverview.mjs'
import { shortSha } from './tests.mjs'

const SECOND_MS = 1000
const SPARK = { width: 90, height: 18, pad: 2 }
const STATUS_CLASS = { passed: 'ok', failed: 'bad', skipped: 'muted', 'not run': 'muted' }

const round = (value) => Math.round(value * 10) / 10

function msText(ms) {
  if (ms === null) return '—'
  return ms < SECOND_MS ? `${ms} ms` : `${(ms / SECOND_MS).toFixed(1)} s`
}

/** The tab hash of a query, e.g. `#tests?feature=ores&sort=slowdown`. */
export function testsHashOf(query) {
  const params = new URLSearchParams(testsQueryParams(query)).toString()
  return params ? `#tests?${params}` : '#tests'
}

// One polyline per stretch of consecutive runs (a run that skipped the test breaks the line).
function stretchesOf(trend) {
  const stretches = [[]]
  trend.forEach((ms, index) => {
    if (ms === null) stretches.push([])
    else stretches.at(-1).push([index, ms])
  })
  return stretches.filter((stretch) => stretch.length > 0)
}

function sparkPointOf([index, ms], count, max) {
  const x = SPARK.pad + (index * (SPARK.width - 2 * SPARK.pad)) / Math.max(1, count - 1)
  const y = SPARK.height - SPARK.pad - (ms * (SPARK.height - 2 * SPARK.pad)) / Math.max(1, max)
  return [round(x), round(y)]
}

// A lone run between gaps is a dot; a stretch of two or more is a line.
function stretchSvg(stretch, count, max) {
  const points = stretch.map((point) => sparkPointOf(point, count, max))
  if (points.length === 1) return `<circle cx="${points[0][0]}" cy="${points[0][1]}" r="1.5"/>`
  return `<polyline points="${points.map((point) => point.join(',')).join(' ')}"/>`
}

function sparkTitleOf(trend, runs) {
  return trend
    .map((ms, index) => `${shortSha(runs[index]?.sha)}: ${ms === null ? 'not run' : msText(ms)}`)
    .join('\n')
}

/** A sparkline of a row's or feature's duration per run, in the warning colour when slowing. */
export function sparklineSvg({ trend, isSlowing }, runs) {
  const max = Math.max(0, ...trend.filter((ms) => ms !== null))
  const lines = stretchesOf(trend).map((stretch) => stretchSvg(stretch, trend.length, max))
  const cls = isSlowing ? 'te-spark slow' : 'te-spark'
  return `<svg class="${cls}" viewBox="0 0 ${SPARK.width} ${SPARK.height}" width="${SPARK.width}" height="${SPARK.height}" role="img"><title>${escapeHtml(sparkTitleOf(trend, runs))}</title>${lines.join('')}</svg>`
}

function fileUrlOf(file, model, view) {
  return `https://github.com/${escapeHtml(view.repo)}/blob/${escapeHtml(model.run.sha ?? 'main')}/${escapeHtml(file)}`
}

function featureLink(feature, model) {
  const hash = testsHashOf({ ...model.query, feature, showsAll: false })
  return `<a href="${escapeHtml(hash)}">${escapeHtml(feature)}</a>`
}

function statusCell(status) {
  return `<td class="${STATUS_CLASS[status] ?? 'muted'}">${escapeHtml(status)}</td>`
}

function slowingMark(row) {
  if (!row.isSlowing) return ''
  return ` <span class="badge warn" title="latest run ${round(row.ratio)}× the median of the runs before">slower</span>`
}

function sourceLine(model, view) {
  const run = model.run
  const commit = run.sha
    ? `<a class="mono" href="https://github.com/${escapeHtml(view.repo)}/commit/${escapeHtml(run.sha)}">${shortSha(run.sha)}</a>`
    : '<span class="muted">—</span>'
  const link = run.url ? ` · <a href="${escapeHtml(run.url)}">run record</a>` : ''
  return `<div>From the ${escapeHtml(run.label ?? '')} run (${escapeHtml(run.source ?? '')}, ${escapeHtml(run.conclusion ?? 'unknown')}) on ${commit} <span title="${escapeHtml(run.startedAt ?? '')}">${ageOf(run.startedAt, view.nowMs)}</span>${link} · trend over the last ${model.runs.length} runs that kept every test (one per nightly) · tests.json updated ${ageOf(model.updatedAt, view.nowMs)}</div>`
}

function countsLine(model) {
  const c = model.counts
  const failed = c.failed ? `<span class="bad">${c.failed} failed</span>` : '0 failed'
  const slowing = model.slowingCount
    ? ` · <a href="${escapeHtml(testsHashOf({ ...model.query, sort: 'slowdown', isDescending: true }))}"><span class="warn">${model.slowingCount} getting slower</span></a>`
    : ''
  return `<div><b>${c.tests}</b> tests in <b>${c.files}</b> files · <span class="ok">${c.passed} passed</span> · ${failed} · ${c.skipped} skipped${slowing}</div>`
}

function featureRow(feature, model) {
  return `<tr><td>${featureLink(feature.feature, model)}${slowingMark(feature)}</td><td>${feature.files}</td><td>${feature.tests}</td><td><span class="ok">${feature.passed}</span> / <span class="${feature.failed ? 'bad' : 'muted'}">${feature.failed}</span> / <span class="muted">${feature.skipped}</span></td><td>${msText(feature.ms)}</td><td>${sparklineSvg(feature, model.runs)}</td></tr>`
}

function featuresSection(model) {
  const rows = model.features.map((feature) => featureRow(feature, model)).join('')
  return `<section class="sl-pool"><h3>Per feature <span class="muted">slice folder, kernel or cross-slice (tests/MANIFEST.md) · total of its files' durations</span></h3>
    <table class="sl-table"><thead><tr><th>Feature</th><th>Files</th><th>Tests</th><th>Passed / failed / skipped</th><th>Total</th><th>Trend</th></tr></thead><tbody>${rows}</tbody></table></section>`
}

function testCell(row, model, view) {
  return `<td>${escapeHtml(row.name)}${slowingMark(row)}<br><a class="mono muted" href="${fileUrlOf(row.file, model, view)}">${escapeHtml(row.file)}</a></td>`
}

function slowestRow(row, model, view) {
  return `<tr>${testCell(row, model, view)}<td>${escapeHtml(row.feature)}</td><td>${msText(row.ms)}</td><td>${sparklineSvg(row, model.runs)}</td></tr>`
}

function slowestSection(model, view) {
  const rows = model.slowest.map((row) => slowestRow(row, model, view)).join('')
  return `<section class="sl-pool"><h3>Slowest ${model.slowest.length} tests</h3>
    <table class="sl-table"><thead><tr><th>Test</th><th>Feature</th><th>Duration</th><th>Trend</th></tr></thead><tbody>${rows}</tbody></table></section>`
}

function optionsOf(values, selected, labelOf = (value) => value) {
  return values
    .map(
      (value) =>
        `<option value="${escapeHtml(value)}"${value === selected ? ' selected' : ''}>${escapeHtml(labelOf(value))}</option>`,
    )
    .join('')
}

/** The filter bar: the page reads `data-te` controls and writes the hash. */
export function renderTestsFilters(model) {
  const q = model.query
  return `<div class="te-filters">
    <label>Feature <select data-te="feature">${optionsOf(['', ...model.featureNames], q.feature ?? '', (name) => name || 'all')}</select></label>
    <label>Status <select data-te="status">${optionsOf(STATUS_FILTERS, q.status)}</select></label>
    <label>Sort <select data-te="sort">${optionsOf(SORTS, q.sort)}</select></label>
    <label><select data-te="dir">${optionsOf(['desc', 'asc'], q.isDescending ? 'desc' : 'asc', (dir) => (dir === 'desc' ? 'high → low' : 'low → high'))}</select></label>
    <input data-te="q" type="search" placeholder="file, test or area" value="${escapeHtml(q.text)}">
  </div>`
}

function listRow(row, model, view) {
  return `<tr>${testCell(row, model, view)}<td>${escapeHtml(row.feature)}<br><span class="muted">${escapeHtml(row.area)}</span></td>${statusCell(row.status)}<td>${msText(row.ms)}</td><td>${sparklineSvg(row, model.runs)}</td></tr>`
}

function showAllLink(model) {
  if (model.rows.length === model.matchCount) return ''
  const hash = testsHashOf({ ...model.query, showsAll: true })
  return ` · <a href="${escapeHtml(hash)}">show all ${model.matchCount}</a>`
}

/** The test rows under the filter bar, re-rendered alone while typing. */
export function renderTestsList(model, view) {
  const rows =
    model.rows.map((row) => listRow(row, model, view)).join('') ||
    '<tr><td colspan="5" class="muted">No test matches the filter.</td></tr>'
  return `<div class="muted">${model.rows.length} of ${model.matchCount} matching tests (${model.counts.tests} in all)${showAllLink(model)}</div>
    <table class="sl-table te-tests"><thead><tr><th>Test · file</th><th>Feature · area</th><th>Status</th><th>Duration</th><th>Trend</th></tr></thead><tbody>${rows}</tbody></table>`
}

/** The whole test list section; `view` carries `repo` (`owner/name`) and `nowMs`. */
export function renderTestsOverview(model, view) {
  return `<section class="te-wide" id="te-overview"><h3>Every test</h3>${sourceLine(model, view)}${countsLine(model)}
    <div class="sl-grid">${featuresSection(model)}${slowestSection(model, view)}</div>
    <div id="te-filter-bar">${renderTestsFilters(model)}</div>
    <div id="te-list">${renderTestsList(model, view)}</div></section>`
}

/** The section when tests.json is missing or has no run yet. */
export function renderTestsOverviewFailure(message) {
  return `<section class="te-wide" id="te-overview"><h3>Every test</h3><div class="warn">Per-test list unavailable: ${escapeHtml(message)}</div></section>`
}
