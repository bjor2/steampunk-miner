// The memory soak's chart (#103): one SVG beside summary.json, uploaded by the CI soak so a reader
// sees the run the gate judged. Two panels on one cycle axis, never one dual axis: the retained
// heap at each cycle boundary against the gate's 20 MB limit, and the geometry, texture and collider
// counts there. The warm-up cycles the gate skips are shaded. Colours are the dataviz reference
// palette's first three categorical slots (validated all-pairs), light and dark.
// Pure: it reads a soak.json object and returns the SVG text.

import { findRetainedHeapLimit, listSoakGateFailures, SOAK_GATE } from './soakGate.mjs'

const MIB = 1048576
const WIDTH = 760
const PLOT_LEFT = 64
const PLOT_RIGHT = WIDTH - 136
const HEAP_PANEL = { top: 76, bottom: 236 }
const COUNT_PANEL = { top: 316, bottom: 456 }
const HEIGHT = COUNT_PANEL.bottom + 40
const Y_TICKS = 4
const COUNT_SERIES = [
  { field: 'geometries', label: 'geometries', className: 'series-1' },
  { field: 'textures', label: 'textures', className: 'series-2' },
  { field: 'rapierColliders', label: 'colliders', className: 'series-3' },
]
const STYLE = `
  .surface { fill: #fcfcfb; }
  .ink { fill: #0b0b0b; font: 13px system-ui, sans-serif; }
  .title { fill: #0b0b0b; font: 600 15px system-ui, sans-serif; }
  .muted { fill: #52514e; font: 11px system-ui, sans-serif; }
  .grid { stroke: #e4e3df; stroke-width: 1; }
  .warmup { fill: #efeeea; }
  .limit { stroke: #52514e; stroke-width: 1.5; stroke-dasharray: 6 4; }
  .line { fill: none; stroke-width: 2; stroke-linejoin: round; }
  .dot { stroke: #fcfcfb; stroke-width: 2; }
  .series-1 { stroke: #2a78d6; } .dot.series-1, .key.series-1 { fill: #2a78d6; }
  .series-2 { stroke: #eb6834; } .dot.series-2, .key.series-2 { fill: #eb6834; }
  .series-3 { stroke: #1baf7a; } .dot.series-3, .key.series-3 { fill: #1baf7a; }
  @media (prefers-color-scheme: dark) {
    .surface { fill: #1a1a19; } .dot { stroke: #1a1a19; }
    .ink, .title { fill: #ffffff; } .muted { fill: #c3c2b7; } .limit { stroke: #c3c2b7; }
    .grid { stroke: #3a3936; } .warmup { fill: #262624; }
    .series-1 { stroke: #3987e5; } .dot.series-1, .key.series-1 { fill: #3987e5; }
    .series-2 { stroke: #d95926; } .dot.series-2, .key.series-2 { fill: #d95926; }
    .series-3 { stroke: #199e70; } .dot.series-3, .key.series-3 { fill: #199e70; }
  }`

/** A soak.json run -> the SVG of its cycle boundaries. */
export function drawSoakChart(run) {
  const chart = planSoakChart(run)
  return wrapSvg([
    drawTitle(chart),
    drawWarmupBands(chart),
    drawHeapPanel(chart),
    drawCountPanel(chart),
  ])
}

function planSoakChart(run) {
  const boundaries = run.boundaries
  const limitBytes = findRetainedHeapLimit(boundaries.slice(SOAK_GATE.warmupCycles))
  return {
    boundaries,
    target: run.target ?? 'browser',
    gate: listSoakGateFailures(boundaries, run.pageErrors).length === 0 ? 'PASS' : 'FAIL',
    limitMB: limitBytes === null ? null : limitBytes / MIB,
    xOf: scaleLinear([0.5, boundaries.length + 0.5], [PLOT_LEFT, PLOT_RIGHT]),
  }
}

function drawTitle(chart) {
  const runs = `${chart.boundaries.length} cycles, ${chart.target} build`
  return [
    `<text class="title" x="${PLOT_LEFT}" y="24">Memory soak: ${chart.gate}, ${escapeText(runs)}</text>`,
    `<text class="muted" x="${PLOT_LEFT}" y="42">At each cycle boundary, on the dock after GC. Shaded: the ${SOAK_GATE.warmupCycles} warm-up cycles the gate skips.</text>`,
  ].join('\n')
}

function drawWarmupBands(chart) {
  const right = chart.xOf(Math.min(SOAK_GATE.warmupCycles, chart.boundaries.length) + 0.5)
  return [HEAP_PANEL, COUNT_PANEL]
    .map(
      (panel) =>
        `<rect class="warmup" x="${PLOT_LEFT}" y="${panel.top}" width="${round(right - PLOT_LEFT)}" height="${panel.bottom - panel.top}"/>`,
    )
    .join('\n')
}

function drawHeapPanel(chart) {
  const heapMB = chart.boundaries.map((boundary) => boundary.usedJSHeapSize / MIB)
  const yOf = scaleLinear(heapDomainOf(heapMB, chart.limitMB), [HEAP_PANEL.bottom, HEAP_PANEL.top])
  const series = { label: 'heap', className: 'series-1', unit: ' MB', decimals: 1 }
  return [
    drawPanelHeading(HEAP_PANEL, 'Retained JS heap (MB)'),
    drawYAxis(HEAP_PANEL, yOf, 1),
    drawCycleAxis(chart, HEAP_PANEL),
    drawLimitLine(chart.limitMB, yOf),
    drawSeries(chart, series, heapMB, yOf),
  ].join('\n')
}

function drawCountPanel(chart) {
  const valuesOf = (field) => chart.boundaries.map((boundary) => boundary[field])
  const highest = Math.max(...COUNT_SERIES.flatMap((series) => valuesOf(series.field)))
  const yOf = scaleLinear([0, highest + 2], [COUNT_PANEL.bottom, COUNT_PANEL.top])
  return [
    drawPanelHeading(COUNT_PANEL, 'Live counts'),
    drawLegend(COUNT_PANEL),
    drawYAxis(COUNT_PANEL, yOf, 0),
    drawCycleAxis(chart, COUNT_PANEL),
    ...COUNT_SERIES.map((series) =>
      drawSeries(
        chart,
        { ...series, unit: ` ${series.label}`, decimals: 0 },
        valuesOf(series.field),
        yOf,
      ),
    ),
  ].join('\n')
}

/** Room above and below the heap, and the limit inside the panel so its margin shows. */
function heapDomainOf(heapMB, limitMB) {
  const values = limitMB === null ? heapMB : [...heapMB, limitMB]
  return [Math.min(...values) - 1, Math.max(...values) + 1]
}

function drawPanelHeading(panel, heading) {
  return `<text class="ink" x="${PLOT_LEFT}" y="${panel.top - 12}">${heading}</text>`
}

function drawLegend(panel) {
  return COUNT_SERIES.map((series, at) => {
    const x = PLOT_LEFT + 140 + at * 110
    return `<rect class="key ${series.className}" x="${x}" y="${panel.top - 22}" width="10" height="10" rx="2"/><text class="muted" x="${x + 16}" y="${panel.top - 13}">${series.label}</text>`
  }).join('\n')
}

function drawYAxis(panel, yOf, decimals) {
  const [low, high] = yOf.domain
  return Array.from({ length: Y_TICKS + 1 }, (_, at) => {
    const value = low + ((high - low) * at) / Y_TICKS
    const y = round(yOf(value))
    return `<line class="grid" x1="${PLOT_LEFT}" x2="${PLOT_RIGHT}" y1="${y}" y2="${y}"/><text class="muted" x="${PLOT_LEFT - 8}" y="${y + 4}" text-anchor="end">${value.toFixed(decimals)}</text>`
  }).join('\n')
}

/** Every cycle up to 20, then every other one, so labels never collide. */
function drawCycleAxis(chart, panel) {
  const every = chart.boundaries.length > 20 ? 2 : 1
  return chart.boundaries
    .filter((boundary, at) => at % every === 0)
    .map(
      (boundary) =>
        `<text class="muted" x="${round(chart.xOf(boundary.cycle))}" y="${panel.bottom + 16}" text-anchor="middle">${boundary.cycle}</text>`,
    )
    .concat(`<text class="muted" x="${PLOT_RIGHT + 8}" y="${panel.bottom + 16}">cycle</text>`)
    .join('\n')
}

function drawLimitLine(limitMB, yOf) {
  if (limitMB === null) return ''
  const y = round(yOf(limitMB))
  return `<line class="limit" x1="${PLOT_LEFT}" x2="${PLOT_RIGHT}" y1="${y}" y2="${y}"/><text class="muted" x="${PLOT_RIGHT + 8}" y="${y + 4}">gate limit ${limitMB.toFixed(1)} MB</text>`
}

/** A 2 px line, an 8 px dot per boundary with its value as a tooltip, a direct label at its end. */
function drawSeries(chart, series, values, yOf) {
  const points = values.map((value, at) => [
    round(chart.xOf(chart.boundaries[at].cycle)),
    round(yOf(value)),
  ])
  const dots = points.map(
    ([x, y], at) =>
      `<circle class="dot ${series.className}" cx="${x}" cy="${y}" r="4"><title>cycle ${chart.boundaries[at].cycle}: ${values[at].toFixed(series.decimals)}${series.unit}</title></circle>`,
  )
  const [lastX, lastY] = points.at(-1)
  const label = `${series.label} ${values.at(-1).toFixed(series.decimals)}`
  return [
    `<polyline class="line ${series.className}" points="${points.map((point) => point.join(',')).join(' ')}"/>`,
    ...dots,
    `<text class="ink" x="${lastX + 10}" y="${lastY + 4}">${label}</text>`,
  ].join('\n')
}

function wrapSvg(parts) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">`,
    `<style>${STYLE}\n</style>`,
    `<rect class="surface" width="${WIDTH}" height="${HEIGHT}"/>`,
    ...parts.filter((part) => part !== ''),
    '</svg>',
    '',
  ].join('\n')
}

function scaleLinear([domainLow, domainHigh], [rangeLow, rangeHigh]) {
  const span = domainHigh - domainLow || 1
  const scale = (value) => rangeLow + ((value - domainLow) / span) * (rangeHigh - rangeLow)
  scale.domain = [domainLow, domainHigh]
  return scale
}

function round(value) {
  return Math.round(value * 10) / 10
}

function escapeText(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
