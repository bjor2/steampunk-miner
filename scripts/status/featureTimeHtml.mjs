// Draws the ticket time roll-up of featureTime.mjs on the Features tab (#135): a compact stacked
// bar with its total and median on every feature row and group heading (`timeHtml`, which the
// page's script inserts), and above the tree a chart comparing the feature areas by measured time,
// split by phase, under the same legend as "Where the time goes" on #issues. Every time is the
// tickets' claimed-to-done window (#138). Static HTML with inline SVG;
// the colours come from phaseCategories.mjs, the classes from scripts/status/index.html.
import { escapeHtml } from './perfOverviewHtml.mjs'
import {
  formatDuration,
  percentOf,
  phaseLegendHtml,
  stackedBarRects,
} from './ticketTimeOverviewHtml.mjs'

const README_URL_PATH = 'blob/main/docs/metrics/README.md'
const NODE_BAR = { width: 100, height: 8 }
const AREA_BAR = { width: 1000, height: 14 }
// A tooltip line break inside a title attribute.
const LINE_BREAK = '&#10;'

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

function measuredLine(time) {
  if (time.measuredCount === 0) return `${plural(time.ticketCount, 'ticket')}, none measured`
  return `Claimed to done: ${formatDuration(time.measuredS)} over ${time.measuredCount} of ${plural(time.ticketCount, 'ticket')}`
}

function unmeasuredLines(time) {
  return time.unmeasuredCount
    ? [`${time.unmeasuredCount} not measured (no metrics file or never claimed)`]
    : []
}

function medianLines(time) {
  return time.medianClaimedToDoneS === null
    ? []
    : [`Median claimed to done: ${formatDuration(time.medianClaimedToDoneS)}`]
}

function categoryLines(time, categories) {
  return categories
    .filter((category) => time.totals[category.id] > 0)
    .map(
      (category) =>
        `${category.name}: ${formatDuration(time.totals[category.id])} (${percentOf(time.totals[category.id], time.measuredS)})`,
    )
}

/** The tooltip of a node's bar: what was measured, the median, then each category's time. */
export function featureTimeTooltip(time, categories) {
  return [
    measuredLine(time),
    ...unmeasuredLines(time),
    ...medianLines(time),
    ...categoryLines(time, categories),
  ]
}

function tooltipAttribute(lines) {
  return lines.map(escapeHtml).join(LINE_BREAK)
}

function unmeasuredSuffix(time) {
  return time.unmeasuredCount
    ? ` <span class="ft-time-unmeasured">· ${time.unmeasuredCount} not measured</span>`
    : ''
}

function medianSuffix(time) {
  return time.medianClaimedToDoneS === null
    ? ''
    : ` <span class="ft-time-median">· median ${formatDuration(time.medianClaimedToDoneS)}</span>`
}

function nodeBarSvg(time, categories) {
  return (
    `<svg class="ft-time-bar" viewBox="0 0 ${NODE_BAR.width} ${NODE_BAR.height}" preserveAspectRatio="none" role="img" aria-label="time per phase">` +
    stackedBarRects(categories, time.totals, NODE_BAR.width / time.measuredS, NODE_BAR.height) +
    '</svg>'
  )
}

function measuredNodeHtml(time, categories) {
  return (
    `<span class="ft-time" data-measured="${time.measuredCount}" title="${tooltipAttribute(featureTimeTooltip(time, categories))}">` +
    nodeBarSvg(time, categories) +
    `<span class="ft-time-total">${formatDuration(time.measuredS)}</span>${medianSuffix(time)}${unmeasuredSuffix(time)}</span>`
  )
}

// No measured ticket: the count of tickets, never a zero time.
function unmeasuredNodeHtml(time) {
  return `<span class="ft-time ft-time-none" data-measured="0" title="${escapeHtml(`${plural(time.ticketCount, 'ticket')}, none with a metrics file`)}">${time.unmeasuredCount} not measured</span>`
}

/** The compact bar and total of one feature or group, or '' when it reaches no ticket. */
export function featureTimeBarHtml(time, categories) {
  if (time.ticketCount === 0) return ''
  if (time.measuredCount === 0) return unmeasuredNodeHtml(time)
  return measuredNodeHtml(time, categories)
}

/** The annotated feature tree with every node's bar as `timeHtml`, for the page's script. */
export function withFeatureTimeBars(nodes, categories) {
  return nodes.map((node) => ({
    ...node,
    timeHtml: featureTimeBarHtml(node.time, categories),
    ...(node.children ? { children: withFeatureTimeBars(node.children, categories) } : {}),
  }))
}

function areaMedianText(time) {
  return time.medianClaimedToDoneS === null
    ? ''
    : ` · median ${formatDuration(time.medianClaimedToDoneS)}`
}

// Like a node bar: an area with no measured ticket shows its count, never a zero time.
function areaCountsText(time) {
  if (time.measuredCount === 0) return `${plural(time.ticketCount, 'ticket')}, none measured`
  return `${formatDuration(time.measuredS)}${areaMedianText(time)} · ${time.measuredCount} of ${plural(time.ticketCount, 'ticket')} measured`
}

function areaRowHtml(area, categories, scale) {
  return (
    `<div class="ft-time-row" data-area="${escapeHtml(area.title)}" title="${tooltipAttribute(featureTimeTooltip(area.time, categories))}">` +
    `<span class="ft-time-name">${escapeHtml(area.title)}</span>` +
    `<svg class="tt-bar" viewBox="0 0 ${AREA_BAR.width} ${AREA_BAR.height}" preserveAspectRatio="none" role="img" aria-label="time per phase">` +
    stackedBarRects(categories, area.time.totals, scale) +
    '</svg>' +
    `<span class="ft-time-counts">${areaCountsText(area.time)}</span>` +
    '</div>'
  )
}

function areaChartHtml(areas, categories) {
  const longest = Math.max(...areas.map((area) => area.time.measuredS), 1)
  const rows = areas.map((area) => areaRowHtml(area, categories, AREA_BAR.width / longest))
  return `<div class="ft-time-rows">${rows.join('')}</div>`
}

function overviewNoteHtml(time, repo) {
  const readme = `https://github.com/${repo}/${README_URL_PATH}`
  return (
    `<div class="tt-note">${time.measuredCount} of the ${plural(time.ticketCount, 'ticket')} linked from the tree have a ` +
    `<code>docs/metrics/tickets/</code> file and a claim. Each counts from its first claim to its close: time before the claim is ` +
    `left out, a block or planner wait after it keeps its own colour. Umbrella issues bring in their sub-issues and a shared ticket counts once per ` +
    `feature and area (<a href="${escapeHtml(readme)}">how it is measured</a>).</div>`
  )
}

/** The section above the tree, for `features` from `annotateFeatures` (areas and `time`). */
export function renderFeatureTimeOverview(features, categories, repo) {
  return (
    `<section class="ft-time-panel" id="feature-time-panel" data-measured="${features.time.measuredCount}">` +
    '<h3>Where the time goes, per feature area</h3>' +
    overviewNoteHtml(features.time, repo) +
    phaseLegendHtml(categories, features.time.totals) +
    areaChartHtml(features.areas, categories) +
    '</section>'
  )
}

/** The section when the feature tree or its roll-up could not be built. */
export function renderFeatureTimeFailure(message) {
  return `<section class="ft-time-panel" id="feature-time-panel" data-error="1"><h3>Where the time goes, per feature area</h3><div class="bad">The feature time roll-up failed to build: ${escapeHtml(message)}</div></section>`
}
