// Renders the "Where the time goes" section at the top of /status/#issues from the model of
// ticketTimeOverview.mjs (#134): static HTML with inline SVG, no script. Each category keeps one
// fixed colour (phaseCategories.mjs); the classes come from scripts/status/index.html. Bars and
// totals run from each ticket's claim to its close (#167).
import { niceCeilingOf } from './perfOverview.mjs'
import { escapeHtml } from './perfOverviewHtml.mjs'

const README_URL_PATH = 'blob/main/docs/metrics/README.md'
const BAR = { width: 1000, height: 14 }
const CHART = { width: 640, height: 200, left: 44, right: 12, top: 12, bottom: 24 }
const COLUMN_FILL = 0.7
// A few days must not turn into slabs: a day column is never wider than this (viewBox units).
const MAX_COLUMN_WIDTH = 48
const GRIDLINES = 4
const POINT_RADIUS = 3.5
const MAX_DAY_LABELS = 10
const SECONDS_PER_MINUTE = 60
const SECONDS_PER_HOUR = 3600
const MONTH_DAY_START = 'YYYY-'.length
const LINES = [
  { key: 'medianLeadS', name: 'Median lead time', cls: 'tt-line-lead' },
  { key: 'medianCycleS', name: 'Median cycle time', cls: 'tt-line-cycle' },
]

/** Seconds for the eye: minutes under an hour, else hours with one decimal. */
export function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) return '—'
  if (seconds < SECONDS_PER_HOUR) return `${Math.round(seconds / SECONDS_PER_MINUTE)} min`
  return `${(seconds / SECONDS_PER_HOUR).toFixed(1)} h`
}

function round(n) {
  return Math.round(n * 10) / 10
}

function sumOf(totals) {
  return Object.values(totals).reduce((sum, seconds) => sum + seconds, 0)
}

export function percentOf(part, whole) {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : '0%'
}

/** The legend of every category with its share of `totals`; the Features tab shows the same (#135). */
export function phaseLegendHtml(categories, totals) {
  const all = sumOf(totals)
  const items = categories.map((category) => {
    const seconds = totals[category.id]
    return (
      `<li data-category="${category.id}"><i class="tt-swatch" style="background:${category.colour}"></i>` +
      `${escapeHtml(category.name)} <span class="muted">${formatDuration(seconds)} · ${percentOf(seconds, all)}</span></li>`
    )
  })
  return `<ul class="tt-legend">${items.join('')}</ul>`
}

function segmentTitle(category, seconds, whole) {
  return `${category.name}: ${formatDuration(seconds)} (${percentOf(seconds, whole)})`
}

/** One rect per category with time, left to right, `scale` viewBox units per second. */
export function stackedBarRects(categories, totals, scale, height = BAR.height) {
  const whole = sumOf(totals)
  let x = 0
  return categories
    .filter((category) => totals[category.id] > 0)
    .map((category) => {
      const width = totals[category.id] * scale
      const rect =
        `<rect x="${round(x)}" y="0" width="${round(width)}" height="${height}" fill="${category.colour}">` +
        `<title>${escapeHtml(segmentTitle(category, totals[category.id], whole))}</title></rect>`
      x += width
      return rect
    })
    .join('')
}

// An old backfill with no claim has no window: drawing all its time would be mostly blocked.
function ticketBarHtml(ticket, categories, scale) {
  if (ticket.claimedTotals === null) return '<span class="muted">no claim data</span>'
  return (
    `<svg class="tt-bar" viewBox="0 0 ${BAR.width} ${BAR.height}" preserveAspectRatio="none" role="img" aria-label="time per category">` +
    stackedBarRects(categories, ticket.claimedTotals, scale) +
    '</svg>'
  )
}

/** One ticket's own bar (full width) and its claimed-to-done time, for its Issue trees card (#194). */
export function ticketPhaseSummaryOf(ticket, categories) {
  return {
    barHtml: ticketBarHtml(ticket, categories, BAR.width / Math.max(claimedSumOf(ticket), 1)),
    totalText: formatDuration(ticket.claimedToDoneS),
  }
}

function ticketRowHtml(ticket, categories, scale) {
  const tag = ticket.backfilled ? ' <span class="muted">backfilled</span>' : ''
  return (
    `<div class="tt-row" data-ticket="${ticket.ticket}">` +
    `<a class="tt-name" href="${escapeHtml(ticket.url)}" title="${escapeHtml(ticket.title)}">` +
    `<span class="num">#${ticket.ticket}</span> ${escapeHtml(ticket.title)}</a>` +
    ticketBarHtml(ticket, categories, scale) +
    `<span class="tt-lead" title="claimed → done">${formatDuration(ticket.claimedToDoneS)}${tag}</span>` +
    '</div>'
  )
}

function claimedSumOf(ticket) {
  return ticket.claimedTotals === null ? 0 : sumOf(ticket.claimedTotals)
}

function recentTicketsHtml(model) {
  const longest = Math.max(...model.recent.map(claimedSumOf), 1)
  const rows = model.recent.map((ticket) =>
    ticketRowHtml(ticket, model.categories, BAR.width / longest),
  )
  return (
    `<div class="sub" id="tt-tickets"><h3>Last ${model.recent.length} closed tickets</h3>` +
    '<div class="muted tt-note">Each bar is the ticket from its claim to its close (claimed → done), time spent blocked left out; right: the whole claimed → done time.</div>' +
    `<div class="tt-rows">${rows.join('')}</div></div>`
  )
}

function plotWidth() {
  return CHART.width - CHART.left - CHART.right
}

function plotHeight() {
  return CHART.height - CHART.top - CHART.bottom
}

function yOf(seconds, maxSeconds) {
  return CHART.top + plotHeight() * (1 - seconds / maxSeconds)
}

function columnXOf(index, count) {
  return CHART.left + (plotWidth() / count) * (index + 0.5)
}

function hoursCeilingOf(maxSeconds) {
  return niceCeilingOf(maxSeconds / SECONDS_PER_HOUR) * SECONDS_PER_HOUR
}

function gridHtml(maxSeconds) {
  const lines = []
  for (let step = 0; step <= GRIDLINES; step += 1) {
    const seconds = (maxSeconds / GRIDLINES) * step
    const y = round(yOf(seconds, maxSeconds))
    lines.push(
      `<line class="perf-grid" x1="${CHART.left}" x2="${CHART.width - CHART.right}" y1="${y}" y2="${y}"/>` +
        `<text class="perf-axis-text" x="${CHART.left - 4}" y="${y + 3}" text-anchor="end">${round(seconds / SECONDS_PER_HOUR)} h</text>`,
    )
  }
  return lines.join('')
}

function isDayLabelShown(index, count) {
  return count <= MAX_DAY_LABELS || index % Math.ceil(count / MAX_DAY_LABELS) === 0
}

function dayLabelsHtml(days) {
  return days
    .map((day, index) =>
      isDayLabelShown(index, days.length)
        ? `<text class="perf-axis-text" x="${round(columnXOf(index, days.length))}" y="${CHART.height - 8}" text-anchor="middle">${day.day.slice(MONTH_DAY_START)}</text>`
        : '',
    )
    .join('')
}

function dayColumnHtml(day, index, count, categories, maxSeconds) {
  const width = Math.min((plotWidth() / count) * COLUMN_FILL, MAX_COLUMN_WIDTH)
  const x = round(columnXOf(index, count) - width / 2)
  let top = CHART.top + plotHeight()
  const whole = sumOf(day.totals)
  const rects = categories
    .filter((category) => day.totals[category.id] > 0)
    .map((category) => {
      const height = (day.totals[category.id] / maxSeconds) * plotHeight()
      top -= height
      return (
        `<rect x="${x}" y="${round(top)}" width="${round(width)}" height="${round(height)}" fill="${category.colour}">` +
        `<title>${escapeHtml(`${day.day} · ${segmentTitle(category, day.totals[category.id], whole)}`)}</title></rect>`
      )
    })
  return `<g data-day="${day.day}">${rects.join('')}</g>`
}

function chartSvg(label, body) {
  return `<svg class="tt-chart" viewBox="0 0 ${CHART.width} ${CHART.height}" role="img" aria-label="${escapeHtml(label)}">${body}</svg>`
}

function dayTotalsHtml(model) {
  const maxSeconds = hoursCeilingOf(Math.max(...model.days.map((day) => sumOf(day.totals)), 1))
  const columns = model.days.map((day, index) =>
    dayColumnHtml(day, index, model.days.length, model.categories, maxSeconds),
  )
  return (
    '<div class="sub" id="tt-days"><h3>Category totals per close day</h3>' +
    '<div class="muted tt-note">The tickets closed that day (UTC), their claimed → done time stacked.</div>' +
    chartSvg(
      'category totals per close day',
      gridHtml(maxSeconds) + columns.join('') + dayLabelsHtml(model.days),
    ) +
    '</div>'
  )
}

function linePointsOf(days, key, maxSeconds) {
  return days
    .map((day, index) => ({ day, index, seconds: day[key] }))
    .filter((point) => point.seconds !== null)
    .map((point) => ({
      ...point,
      x: round(columnXOf(point.index, days.length)),
      y: round(yOf(point.seconds, maxSeconds)),
    }))
}

function lineHtml(line, days, maxSeconds) {
  const points = linePointsOf(days, line.key, maxSeconds)
  const path = `<polyline class="${line.cls}" fill="none" points="${points.map((p) => `${p.x},${p.y}`).join(' ')}"/>`
  const dots = points.map(
    (p) =>
      `<circle class="${line.cls}" cx="${p.x}" cy="${p.y}" r="${POINT_RADIUS}"><title>${escapeHtml(`${p.day.day} · ${line.name}: ${formatDuration(p.seconds)} (${p.day.ticketCount} tickets)`)}</title></circle>`,
  )
  return path + dots.join('')
}

function completionLegendHtml() {
  return `<div class="tt-line-legend">${LINES.map((line) => `<span><i class="tt-swatch ${line.cls}"></i>${line.name}</span>`).join('')}</div>`
}

function completionTimesHtml(model) {
  const medians = model.days.flatMap((day) => LINES.map((line) => day[line.key] ?? 0))
  const maxSeconds = hoursCeilingOf(Math.max(...medians, 1))
  const lines = LINES.map((line) => lineHtml(line, model.days, maxSeconds))
  return (
    '<div class="sub" id="tt-completion"><h3>Median cycle and lead time per close day</h3>' +
    '<div class="muted tt-note">Lead: created to closed. Cycle: first session to closed.</div>' +
    completionLegendHtml() +
    chartSvg(
      'median cycle and lead time per close day',
      gridHtml(maxSeconds) + lines.join('') + dayLabelsHtml(model.days),
    ) +
    '</div>'
  )
}

function problemsHtml(problems) {
  if (problems.length === 0) return ''
  return `<ul class="list warn">${problems.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>`
}

function unclaimedNoteOf(model) {
  return model.unclaimedCount > 0 ? ` ${model.unclaimedCount} with no claim data are left out.` : ''
}

function headerHtml(model) {
  const readme = `https://github.com/${model.repo}/${README_URL_PATH}`
  return (
    '<h2>Where the time goes</h2>' +
    `<div class="muted tt-note">${model.ticketCount} closed tickets from <code>docs/metrics/tickets/</code>, ` +
    'split into fixed phase categories, claimed → done only: time before the first claim and time spent blocked are left out ' +
    `(<a href="${escapeHtml(readme)}">how it is measured</a>).${unclaimedNoteOf(model)}</div>`
  )
}

/** The section for a model from `buildTicketTimeOverview`. */
export function renderTicketTimeOverview(model) {
  const body =
    model.ticketCount === 0
      ? '<div class="muted">No ticket phases recorded yet.</div>'
      : `<div class="tt-grid">${recentTicketsHtml(model)}<div>${dayTotalsHtml(model)}${completionTimesHtml(model)}</div></div>`
  return (
    `<section class="panel" id="ticket-time-panel" data-tickets="${model.ticketCount}">` +
    headerHtml(model) +
    phaseLegendHtml(model.categories, model.categoryTotals) +
    problemsHtml(model.problems) +
    body +
    '</section>'
  )
}

/** The section when the model could not be built: the issue trees still render. */
export function renderTicketTimeFailure(message) {
  return `<section class="panel" id="ticket-time-panel" data-error="1"><h2>Where the time goes</h2><div class="bad">The ticket time overview failed to build: ${escapeHtml(message)}</div></section>`
}
