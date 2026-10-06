/**
 * Composes one icon of the set into SVG text (#158 "Icon language"): the frame that says what kind
 * of thing it is, filled in the colour of its axis, with the glyph's silhouette cut into it in ink
 * and its engraved lines in the frame's own colour; a frameless HUD glyph is the silhouette itself
 * in its axis colour with an ink outline. Everything sits on the 24 grid, so the same text draws
 * at 16, 24, 32 and 48. Pure string building: `npm run art:icons` writes the files.
 */
import type { IconAxis, IconEntry, IconFrame } from './iconSet'
import { glyphOf, type IconGlyph } from './iconGlyphs'

/** The tokens of `src/ui/kit/tokens.css`, repeated here because an SVG file carries no CSS. */
export const ICON_INK = '#1b1613'

export const ICON_COLOURS: Readonly<Record<IconAxis, string>> = {
  brass: '#c9a24b',
  verdigris: '#3fa7a0',
  warning: '#e0602a',
  /** Steel, the pad's grey lifted to read on the dark panel: chrome, never a stat or a danger. */
  neutral: '#a8aeb6',
}

/** The bay accents of #45, worn by the bay emblems. */
export const BAY_EMBLEM_COLOURS: Readonly<Record<string, string>> = {
  sell: '#b87333',
  upgrade: '#3fa7a0',
  refinery: '#e0602a',
}

export const ICON_GRID = 24

const OUTLINE_WIDTH = 1.5

/** How far the frame's inner box is inset and scaled from the 24 grid. */
interface GlyphFit {
  offset: number
  size: number
}

const GLYPH_FITS: Readonly<Record<IconFrame, GlyphFit>> = {
  plate: { offset: 5, size: 14 },
  gear: { offset: 6.5, size: 11 },
  hex: { offset: 5.5, size: 13 },
  /** The triangle's room is low and narrow, so the glyph sits in its lower half. */
  triangle: { offset: 7, size: 10 },
  none: { offset: 1, size: 22 },
}

const GEAR_TEETH = 10

const HEX_RADIUS = 10.5

export interface IconDrawing {
  title: string
  frame: IconFrame
  axis: IconAxis
  /** The frame's fill (a frameless glyph's body): the axis colour unless an accent overrides it. */
  bodyColour: string
  glyph: IconGlyph
  /** Elements drawn over the glyph on the 24 grid: an ore icon's grade pips. */
  extraElements?: readonly string[]
}

/** The set entry as a drawing; the glyph key must exist. */
export function drawingOfEntry(entry: IconEntry): IconDrawing {
  const glyph = glyphOf(entry.glyph)
  if (glyph === null) throw new Error(`icon "${entry.id}" names no glyph "${entry.glyph}"`)
  return {
    title: entry.title,
    frame: entry.frame,
    axis: entry.axis,
    bodyColour: bodyColourOf(entry),
    glyph,
  }
}

export function iconSvgOf(entry: IconEntry): string {
  return svgTextOf(drawingOfEntry(entry))
}

/** The SVG text of a drawing; `extraMarks` are more `data-*` attributes on the root. */
export function svgTextOf(
  drawing: IconDrawing,
  extraMarks: Readonly<Record<string, string>> = {},
): string {
  const marks = { frame: drawing.frame, axis: drawing.axis, ...extraMarks }
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ICON_GRID} ${ICON_GRID}" width="${ICON_GRID}" height="${ICON_GRID}"${marksOf(marks)}>`,
    `  <title>${escapeText(drawing.title)}</title>`,
    ...innerLinesOf(drawing).map((line) => `  ${line}`),
    '</svg>',
    '',
  ].join('\n')
}

/** The frame and glyph elements without the `<svg>` wrapper, for a `<symbol>` on a sheet. */
export function innerLinesOf(drawing: IconDrawing): string[] {
  const extra = drawing.extraElements ?? []
  if (drawing.frame === 'none') return [frameless(drawing), ...extra]
  return [frameElementOf(drawing.frame, drawing.bodyColour), framedGlyph(drawing), ...extra]
}

function bodyColourOf(entry: IconEntry): string {
  const bay = /^emblem-bay-(.+)$/.exec(entry.id)?.[1]
  return bay === undefined
    ? ICON_COLOURS[entry.axis]
    : (BAY_EMBLEM_COLOURS[bay] ?? ICON_COLOURS[entry.axis])
}

/**
 * The silhouette in the axis colour with an ink outline; its engraving is a pipe, the colour over
 * a wider ink stroke, so a line that leaves the silhouette still reads on the dark panel.
 */
function frameless(drawing: IconDrawing): string {
  const fit = GLYPH_FITS.none
  const strokeWidth = OUTLINE_WIDTH / (fit.size / ICON_GRID)
  return group(fit, [
    path(
      drawing.glyph.body,
      `fill="${drawing.bodyColour}" stroke="${ICON_INK}" stroke-width="${num(strokeWidth)}" stroke-linejoin="round" fill-rule="evenodd"`,
    ),
    ...engravingOf(drawing.glyph, ICON_INK, strokeWidth * 2),
    ...engravingOf(drawing.glyph, drawing.bodyColour, strokeWidth * 0.8),
  ])
}

/** The silhouette cut in ink into the frame, its engraving in the frame's colour. */
function framedGlyph(drawing: IconDrawing): string {
  const fit = GLYPH_FITS[drawing.frame]
  const strokeWidth = OUTLINE_WIDTH / (fit.size / ICON_GRID)
  return group(fit, [
    path(drawing.glyph.body, `fill="${ICON_INK}" fill-rule="evenodd"`),
    ...engravingOf(drawing.glyph, drawing.bodyColour, strokeWidth),
  ])
}

function engravingOf(glyph: IconGlyph, colour: string, strokeWidth: number): string[] {
  const lines =
    glyph.lines === undefined
      ? []
      : [
          path(
            glyph.lines,
            `fill="none" stroke="${colour}" stroke-width="${num(strokeWidth)}" stroke-linecap="round" stroke-linejoin="round"`,
          ),
        ]
  const dots = (glyph.dots ?? []).map(
    ([x, y, r]) => `<circle cx="${num(x)}" cy="${num(y)}" r="${num(r)}" fill="${colour}"/>`,
  )
  return [...lines, ...dots]
}

function group(fit: GlyphFit, children: string[]): string {
  const scale = fit.size / ICON_GRID
  return `<g transform="translate(${num(fit.offset)} ${num(fit.offset)}) scale(${num(scale)})">${children.join('')}</g>`
}

export function frameElementOf(frame: Exclude<IconFrame, 'none'>, fill: string): string {
  const paint = `fill="${fill}" stroke="${ICON_INK}" stroke-width="${OUTLINE_WIDTH}" stroke-linejoin="round"`
  if (frame === 'plate') return plateElement(paint)
  if (frame === 'gear') return path(gearPath(), paint)
  if (frame === 'hex') return path(hexPath(), paint)
  return path('M12 1.5L22.5 21.5H1.5z', paint)
}

/** A riveted plate: the rounded square and one rivet in each corner. */
function plateElement(paint: string): string {
  const rivets = [4.5, 19.5]
    .flatMap((x) =>
      [4.5, 19.5].map((y) => `<circle cx="${x}" cy="${y}" r="1" fill="${ICON_INK}"/>`),
    )
    .join('')
  return `<rect x="1.5" y="1.5" width="21" height="21" rx="2.5" ${paint}/>${rivets}`
}

/** A gear rim: ten teeth between an outer and an inner radius, as one closed path. */
function gearPath(): string {
  const centre = ICON_GRID / 2
  const outer = 11
  const inner = 9.2
  const step = (Math.PI * 2) / GEAR_TEETH
  const points: string[] = []
  for (let tooth = 0; tooth < GEAR_TEETH; tooth++) {
    const at = tooth * step
    points.push(polar(centre, inner, at - step * 0.3))
    points.push(polar(centre, outer, at - step * 0.15))
    points.push(polar(centre, outer, at + step * 0.15))
    points.push(polar(centre, inner, at + step * 0.3))
  }
  return `M${points.join('L')}z`
}

/** A pointy-top hexagon, the cell of a resource. */
function hexPath(): string {
  const centre = ICON_GRID / 2
  const points = Array.from({ length: 6 }, (_, corner) =>
    polar(centre, HEX_RADIUS, -Math.PI / 2 + (corner * Math.PI) / 3),
  )
  return `M${points.join('L')}z`
}

function polar(centre: number, radius: number, angle: number): string {
  return `${num(centre + radius * Math.cos(angle))} ${num(centre + radius * Math.sin(angle))}`
}

function path(d: string, paint: string): string {
  return `<path d="${d}" ${paint}/>`
}

function marksOf(marks: Readonly<Record<string, string>>): string {
  return Object.entries(marks)
    .map(([name, value]) => ` data-${name}="${value}"`)
    .join('')
}

/** Two decimals, no trailing zeros, so the files are the same on every machine. */
export function num(value: number): string {
  return String(Math.round(value * 100) / 100)
}

function escapeText(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}
