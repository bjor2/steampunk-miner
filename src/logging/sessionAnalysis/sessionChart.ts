/**
 * The session report's chart (#125): one series as a line over one axis, with an optional dashed
 * reference line (the frame budget), as SVG text. One series per chart, so the title names it and
 * no legend is needed; the page puts the same numbers in a table beside it. Colours are the soak
 * chart's (#103): the dataviz reference palette's first categorical slot, light and dark.
 */

export interface ChartPoint {
  x: number
  y: number
}

export interface LineChart {
  title: string
  xLabel: string
  yLabel: string
  points: readonly ChartPoint[]
  reference?: { y: number; label: string }
}

const WIDTH = 640
const HEIGHT = 240
const PLOT = { left: 64, right: WIDTH - 96, top: 40, bottom: HEIGHT - 40 }
const Y_TICKS = 4
/** A dot (with its tooltip) per point up to this many; a longer series is thinned evenly. */
const MAX_DOTS = 120
/** Room above the highest value or reference line. */
const Y_HEADROOM = 1.1

export const CHART_STYLE = `
  svg.chart .surface { fill: #fcfcfb; }
  svg.chart .ink { fill: #0b0b0b; font: 13px system-ui, sans-serif; }
  svg.chart .muted { fill: #52514e; font: 11px system-ui, sans-serif; }
  svg.chart .grid { stroke: #e4e3df; stroke-width: 1; }
  svg.chart .reference { stroke: #52514e; stroke-width: 1.5; stroke-dasharray: 6 4; }
  svg.chart .line { fill: none; stroke: #2a78d6; stroke-width: 2; stroke-linejoin: round; }
  svg.chart .dot { fill: #2a78d6; stroke: #fcfcfb; stroke-width: 2; }
  @media (prefers-color-scheme: dark) {
    svg.chart .surface { fill: #1a1a19; } svg.chart .ink { fill: #ffffff; }
    svg.chart .muted { fill: #c3c2b7; } svg.chart .grid { stroke: #3a3936; }
    svg.chart .reference { stroke: #c3c2b7; }
    svg.chart .line { stroke: #3987e5; } svg.chart .dot { fill: #3987e5; stroke: #1a1a19; }
  }`

export function drawLineChart(chart: LineChart): string {
  if (chart.points.length === 0) return ''
  const xOf = scaleOf(domainOf(chart.points.map((point) => point.x)), [PLOT.left, PLOT.right])
  const yOf = scaleOf(yDomainOf(chart), [PLOT.bottom, PLOT.top])
  return [
    `<svg class="chart" xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${escapeHtml(chart.title)}">`,
    `<rect class="surface" width="${WIDTH}" height="${HEIGHT}"/>`,
    `<text class="ink" x="${PLOT.left}" y="22">${escapeHtml(chart.title)}</text>`,
    drawYAxis(yOf, chart.yLabel),
    drawXAxis(xOf, chart.xLabel),
    drawReference(chart, yOf),
    drawLine(chart, xOf, yOf),
    '</svg>',
  ].join('\n')
}

interface Scale {
  (value: number): number
  domain: [number, number]
}

function scaleOf([low, high]: [number, number], [from, to]: [number, number]): Scale {
  const span = high - low || 1
  const scale = ((value: number) => from + ((value - low) / span) * (to - from)) as Scale
  scale.domain = [low, high]
  return scale
}

function domainOf(values: readonly number[]): [number, number] {
  return [Math.min(...values), Math.max(...values)]
}

/** From zero, so a small change does not read as a large one; the reference line inside. */
function yDomainOf(chart: LineChart): [number, number] {
  const values = chart.points.map((point) => point.y)
  const high = Math.max(...values, chart.reference?.y ?? 0)
  return [Math.min(0, ...values), high === 0 ? 1 : high * Y_HEADROOM]
}

function drawYAxis(yOf: Scale, label: string): string {
  const [low, high] = yOf.domain
  const ticks = Array.from({ length: Y_TICKS + 1 }, (_, at) => low + ((high - low) * at) / Y_TICKS)
  return ticks
    .map((value) => {
      const y = round(yOf(value))
      return `<line class="grid" x1="${PLOT.left}" x2="${PLOT.right}" y1="${y}" y2="${y}"/><text class="muted" x="${PLOT.left - 8}" y="${y + 4}" text-anchor="end">${tickText(value)}</text>`
    })
    .concat(`<text class="muted" x="${PLOT.left}" y="${PLOT.top - 6}">${escapeHtml(label)}</text>`)
    .join('\n')
}

function drawXAxis(xOf: Scale, label: string): string {
  const [low, high] = xOf.domain
  return [
    `<text class="muted" x="${PLOT.left}" y="${PLOT.bottom + 16}" text-anchor="middle">${tickText(low)}</text>`,
    `<text class="muted" x="${PLOT.right}" y="${PLOT.bottom + 16}" text-anchor="middle">${tickText(high)}</text>`,
    `<text class="muted" x="${(PLOT.left + PLOT.right) / 2}" y="${PLOT.bottom + 30}" text-anchor="middle">${escapeHtml(label)}</text>`,
  ].join('\n')
}

function drawReference(chart: LineChart, yOf: Scale): string {
  if (chart.reference === undefined) return ''
  const y = round(yOf(chart.reference.y))
  return `<line class="reference" x1="${PLOT.left}" x2="${PLOT.right}" y1="${y}" y2="${y}"/><text class="muted" x="${PLOT.right + 6}" y="${y + 4}">${escapeHtml(chart.reference.label)}</text>`
}

/** A 2 px line, 8 px dots with their values as tooltips, the last value labelled at its end. */
function drawLine(chart: LineChart, xOf: Scale, yOf: Scale): string {
  const placed = chart.points.map((point) => ({
    point,
    x: round(xOf(point.x)),
    y: round(yOf(point.y)),
  }))
  const every = Math.ceil(placed.length / MAX_DOTS)
  const dots = placed
    .filter((_, at) => at % every === 0 || at === placed.length - 1)
    .map(
      ({ point, x, y }) =>
        `<circle class="dot" cx="${x}" cy="${y}" r="4"><title>${escapeHtml(chart.xLabel)} ${tickText(point.x)}: ${tickText(point.y)} ${escapeHtml(chart.yLabel)}</title></circle>`,
    )
  const last = placed[placed.length - 1]
  return [
    `<polyline class="line" points="${placed.map(({ x, y }) => `${x},${y}`).join(' ')}"/>`,
    ...dots,
    `<text class="ink" x="${last.x + 8}" y="${last.y + 4}">${tickText(last.point.y)}</text>`,
  ].join('\n')
}

/** Whole numbers as they are, others to two significant decimals at most. */
function tickText(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(Math.abs(value) < 10 ? 2 : 1)
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
