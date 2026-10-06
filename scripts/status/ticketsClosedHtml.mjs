// Renders "Tickets closed over time" at the top of /status/#features from the model of
// ticketsClosed.mjs (#138): daily bars of closed tickets with the running total as a line over
// them, and beside it the median claimed-to-done time per close day. Static HTML with inline SVG;
// a day's hover (its SVG title) gives the date, the count and the titles of the tickets closed.
// The classes come from scripts/status/index.html.
import { escapeHtml } from './perfOverviewHtml.mjs'
import { formatDuration } from './ticketTimeOverviewHtml.mjs'

const CHART = { width: 640, height: 200, left: 40, right: 40, top: 12, bottom: 24 }
const COLUMN_FILL = 0.7
const MAX_COLUMN_WIDTH = 48
const GRIDLINES = 4
const POINT_RADIUS = 3.5
const MAX_DAY_LABELS = 10
const MONTH_DAY_START = 'YYYY-'.length
const SECONDS_PER_HOUR = 3600
const AXIS_LABEL_GAP = 4
// A tooltip line break inside an SVG title.
const LINE_BREAK = '\n'

function round(n) {
  return Math.round(n * 10) / 10
}

function plotWidth() {
  return CHART.width - CHART.left - CHART.right
}

function plotHeight() {
  return CHART.height - CHART.top - CHART.bottom
}

function plotBottom() {
  return CHART.top + plotHeight()
}

function yOf(value, max) {
  return CHART.top + plotHeight() * (1 - value / max)
}

function columnXOf(index, count) {
  return CHART.left + (plotWidth() / count) * (index + 0.5)
}

function columnWidthOf(count) {
  return Math.min((plotWidth() / count) * COLUMN_FILL, MAX_COLUMN_WIDTH)
}

// Whole tickets on every grid line.
function countCeilingOf(max) {
  return Math.max(Math.ceil(max / GRIDLINES), 1) * GRIDLINES
}

function hoursCeilingOf(maxSeconds) {
  return (
    Math.max(Math.ceil(maxSeconds / SECONDS_PER_HOUR / GRIDLINES), 1) * GRIDLINES * SECONDS_PER_HOUR
  )
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

function gridLine(y) {
  return `<line class="perf-grid" x1="${CHART.left}" x2="${CHART.width - CHART.right}" y1="${y}" y2="${y}"/>`
}

function axisText(x, y, anchor, text) {
  return `<text class="perf-axis-text" x="${x}" y="${y + 3}" text-anchor="${anchor}">${text}</text>`
}

// Grid lines at the left scale's steps; the right scale, when given, labels the same lines.
function gridHtml(leftMax, formatLeft, rightMax = null) {
  const lines = []
  for (let step = 0; step <= GRIDLINES; step += 1) {
    const y = round(yOf(step, GRIDLINES))
    const left = axisText(
      CHART.left - AXIS_LABEL_GAP,
      y,
      'end',
      formatLeft((leftMax / GRIDLINES) * step),
    )
    const right =
      rightMax === null
        ? ''
        : axisText(
            CHART.width - CHART.right + AXIS_LABEL_GAP,
            y,
            'start',
            round((rightMax / GRIDLINES) * step),
          )
    lines.push(gridLine(y) + left + right)
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

function chartSvg(label, body) {
  return `<svg class="tt-chart" viewBox="0 0 ${CHART.width} ${CHART.height}" role="img" aria-label="${escapeHtml(label)}">${body}</svg>`
}

/** The hover of one day: the date, the count, the running total, then each ticket's title. */
export function closedDayTooltip(day) {
  return [
    `${day.day} · ${day.count} closed (${day.cumulative} in all)`,
    ...day.tickets.map((ticket) => `#${ticket.number} ${ticket.title}`),
  ]
}

// A full-height transparent rect, so a day with no close still answers the hover.
function closedDayColumnHtml(day, index, count, maxCount) {
  const width = columnWidthOf(count)
  const x = round(columnXOf(index, count) - width / 2)
  const top = round(yOf(day.count, maxCount))
  return (
    `<g class="tc-day" data-day="${day.day}" data-count="${day.count}">` +
    `<title>${escapeHtml(closedDayTooltip(day).join(LINE_BREAK))}</title>` +
    `<rect class="tc-hit" x="${x}" y="${CHART.top}" width="${round(width)}" height="${plotHeight()}"/>` +
    `<rect class="tc-bar" x="${x}" y="${top}" width="${round(width)}" height="${round(plotBottom() - top)}"/>` +
    '</g>'
  )
}

function pointsOf(days, valueOf, max) {
  return days
    .map((day, index) => ({ day, value: valueOf(day), x: round(columnXOf(index, days.length)) }))
    .filter((point) => point.value !== null)
    .map((point) => ({ ...point, y: round(yOf(point.value, max)) }))
}

function lineHtml(cls, points, titleOf) {
  const path = `<polyline class="${cls}" fill="none" points="${points.map((p) => `${p.x},${p.y}`).join(' ')}"/>`
  const dots = points.map(
    (p) =>
      `<circle class="${cls}" cx="${p.x}" cy="${p.y}" r="${POINT_RADIUS}"><title>${escapeHtml(titleOf(p))}</title></circle>`,
  )
  return path + dots.join('')
}

function lineLegendHtml(items) {
  return `<div class="tt-line-legend">${items.map(([cls, name]) => `<span><i class="tt-swatch ${cls}"></i>${name}</span>`).join('')}</div>`
}

function closedChartHtml(days) {
  const maxCount = countCeilingOf(Math.max(...days.map((day) => day.count)))
  const maxCumulative = countCeilingOf(days.at(-1).cumulative)
  const columns = days.map((day, index) => closedDayColumnHtml(day, index, days.length, maxCount))
  const cumulative = lineHtml(
    'tc-cumulative',
    pointsOf(days, (day) => day.cumulative, maxCumulative),
    (p) => `${p.day.day} · ${p.value} closed in all`,
  )
  return (
    '<div class="sub" id="tc-closed"><h3>Tickets closed over time</h3>' +
    '<div class="tt-note">Build and perf tickets closed per day (UTC, bars, left scale) and in all (line, right scale).</div>' +
    lineLegendHtml([
      ['tc-bar', 'Closed that day'],
      ['tc-cumulative', 'Closed in all'],
    ]) +
    chartSvg(
      'tickets closed per day and in all',
      gridHtml(maxCount, round, maxCumulative) +
        columns.join('') +
        cumulative +
        dayLabelsHtml(days),
    ) +
    '</div>'
  )
}

function hoursLabel(seconds) {
  return `${round(seconds / SECONDS_PER_HOUR)} h`
}

function medianChartHtml(days) {
  const maxSeconds = hoursCeilingOf(Math.max(...days.map((day) => day.medianClaimedToDoneS ?? 0)))
  const line = lineHtml(
    'tc-median',
    pointsOf(days, (day) => day.medianClaimedToDoneS, maxSeconds),
    (p) =>
      `${p.day.day} · median claimed to done ${formatDuration(p.value)} (${plural(p.day.measuredCount, 'measured ticket')})`,
  )
  return (
    '<div class="sub" id="tc-median"><h3>Median claimed to done per close day</h3>' +
    '<div class="tt-note">From the first claim to the close, over the tickets with a metrics file closed that day.</div>' +
    lineLegendHtml([['tc-median', 'Median claimed to done']]) +
    chartSvg(
      'median claimed-to-done time per close day',
      gridHtml(maxSeconds, hoursLabel) + line + dayLabelsHtml(days),
    ) +
    '</div>'
  )
}

/** The section for a model from `buildTicketsClosedOverTime`. */
export function renderTicketsClosedOverTime(model) {
  const body =
    model.days.length === 0
      ? '<div class="tt-note">No build or perf ticket closed yet.</div>'
      : `<div class="tc-grid">${closedChartHtml(model.days)}${medianChartHtml(model.days)}</div>`
  return (
    `<section class="ft-time-panel" id="tickets-closed-panel" data-closed="${model.closedCount}">` +
    body +
    '</section>'
  )
}

/** The section when the model could not be built: the feature tree still renders. */
export function renderTicketsClosedFailure(message) {
  return `<section class="ft-time-panel" id="tickets-closed-panel" data-error="1"><h3>Tickets closed over time</h3><div class="bad">The tickets-closed chart failed to build: ${escapeHtml(message)}</div></section>`
}
