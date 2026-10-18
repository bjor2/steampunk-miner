/**
 * The material looks the terrain shader can draw (ticket 450 under #139; TD shape 6226270701, GD
 * ruling 6226278574): procedural silhouettes and patterns, no texture, chosen per tile by a
 * uniform. The kernel owns the catalogue because its shader draws it, as with the gate patterns
 * (`gatePatterns.ts`); a species row names a silhouette and a pattern by id, and the shader draws
 * each by its code, its position in `kindLooks.json` plus one (0 draws the family look). Read once
 * and refused whole when broken, so a bad row fails at load with every problem listed.
 */
import lookFile from './kindLooks.json'

/** Appended only: the shader's primitive codes follow this order. */
export const KIND_PRIMITIVES = [
  'box',
  'diamond',
  'disc',
  'hexagon',
  'rod',
  'ring',
  'star',
  'triangle',
] as const
export const KIND_LAYOUTS = ['scatter', 'row', 'stack'] as const
export const PATTERN_PRIMITIVES = [
  'flat',
  'mottle',
  'crust',
  'bands',
  'cloud',
  'gloss',
  'speckle',
  'core',
  'rings',
  'veins',
  'fibres',
] as const

export type KindPrimitive = (typeof KIND_PRIMITIVES)[number]
export type KindLayout = (typeof KIND_LAYOUTS)[number]
export type PatternPrimitive = (typeof PATTERN_PRIMITIVES)[number]

/** The shader loops over at most this many grains a tile. */
export const MAX_KIND_GRAINS = 6

export interface KindSilhouette {
  id: string
  primitive: KindPrimitive
  /** Grains a tile, 1 to `MAX_KIND_GRAINS`. */
  count: number
  /** A grain's half-size, in tiles. */
  size: number
  /**
   * Height over width; a rod's thickness over its half-length, a ring's band over its radius, a
   * star's inner radius over its outer one.
   */
  aspect: number
  /** The largest turn a grain takes, as a share of a half turn. */
  turn: number
  layout: KindLayout
}

export interface KindPattern {
  id: string
  primitive: PatternPrimitive
  /** Repeats a tile; a crust's width in tiles. */
  scale: number
  /** The shade's swing either side of 1; below 0 it flips, so bright speckles become pits. */
  contrast: number
  /** Degrees, for the directed patterns (bands, gloss, fibres). */
  angle: number
}

export interface KindLookCatalogue {
  silhouettes: readonly KindSilhouette[]
  patterns: readonly KindPattern[]
}

/** The code the shader reads for no species: the family look. */
export const NO_KIND_LOOK_CODE = 0

/**
 * The thinnest stroke a grain may draw, in tiles: about 1.3 px at the 22 px a tile of a phone-size
 * view, under which a ring or rod blurs into the ground (GD ruling 6226278574 item 3: every
 * material stays clearly different at phone size; ticket 450's eye check at 40 and 22 px).
 */
export const MIN_STROKE_TILES = 0.06
const SIZE_RANGE = [1 / 50, 2 / 5] as const
const ASPECT_RANGE = [1 / 20, 4] as const
const CONTRAST_MAX = 0.7
const ANGLE_MAX = 180

type Raw = Record<string, unknown>

export const KIND_LOOKS: KindLookCatalogue = loadKindLookCatalogue(lookFile)

/** Why a file is not a kind look catalogue; empty when it may ship. */
export function kindLookCatalogueProblems(raw: unknown): string[] {
  const file = (raw ?? {}) as Raw
  if (!Array.isArray(file.silhouettes) || !Array.isArray(file.patterns)) {
    return ['silhouettes and patterns must be lists']
  }
  return [
    ...(file.silhouettes as Raw[]).flatMap(silhouetteProblems),
    ...(file.patterns as Raw[]).flatMap(patternProblems),
    ...duplicateIdProblems(file.silhouettes as Raw[], 'silhouettes'),
    ...duplicateIdProblems(file.patterns as Raw[], 'patterns'),
  ]
}

export function loadKindLookCatalogue(raw: unknown): KindLookCatalogue {
  const problems = kindLookCatalogueProblems(raw)
  if (problems.length > 0) throw new Error(`kindLooks.json is refused:\n${problems.join('\n')}`)
  const file = raw as KindLookCatalogue
  return { silhouettes: [...file.silhouettes], patterns: [...file.patterns] }
}

/** The shader's code for a silhouette id; throws on an id the shader cannot draw. */
export function silhouetteCodeOf(id: string, catalogue: KindLookCatalogue = KIND_LOOKS): number {
  return codeOf(catalogue.silhouettes, id, 'silhouette')
}

/** The shader's code for a pattern id; throws on an id the shader cannot draw. */
export function patternCodeOf(id: string, catalogue: KindLookCatalogue = KIND_LOOKS): number {
  return codeOf(catalogue.patterns, id, 'pattern')
}

function codeOf(rows: readonly { id: string }[], id: string, what: string): number {
  const at = rows.findIndex((row) => row.id === id)
  if (at < 0) throw new Error(`the terrain shader draws no ${what} ${JSON.stringify(id)}`)
  return at + 1
}

function silhouetteProblems(row: Raw, at: number): string[] {
  const where = `silhouettes[${at}]`
  return [
    ...idProblems(row, where),
    ...oneOfProblems(row.primitive, KIND_PRIMITIVES, `${where}.primitive`),
    ...oneOfProblems(row.layout, KIND_LAYOUTS, `${where}.layout`),
    ...(isWholeIn(row.count, 1, MAX_KIND_GRAINS)
      ? []
      : [`${where}.count must be a whole number in 1..${MAX_KIND_GRAINS}`]),
    ...rangeProblems(row.size, SIZE_RANGE, `${where}.size`),
    ...rangeProblems(row.aspect, ASPECT_RANGE, `${where}.aspect`),
    ...rangeProblems(row.turn, [0, 1], `${where}.turn`),
    ...strokeProblems(row, where),
  ]
}

function strokeProblems(row: Raw, where: string): string[] {
  const isMeasurable = typeof row.size === 'number' && typeof row.aspect === 'number'
  if (!isMeasurable || thinnestStrokeOf(row as unknown as KindSilhouette) >= MIN_STROKE_TILES) {
    return []
  }
  return [`${where} draws a stroke under ${MIN_STROKE_TILES} tiles, lost at phone size`]
}

/**
 * A grain's thinnest stroke in tiles, as the shader draws it: a rod's or a star's core is twice
 * its aspect share of the size, a ring's band its aspect share, any other grain its short side.
 */
export function thinnestStrokeOf({ primitive, size, aspect }: KindSilhouette): number {
  if (primitive === 'ring') return size * aspect
  if (primitive === 'rod' || primitive === 'star') return 2 * size * aspect
  return 2 * Math.min(size, size * aspect)
}

function patternProblems(row: Raw, at: number): string[] {
  const where = `patterns[${at}]`
  return [
    ...idProblems(row, where),
    ...oneOfProblems(row.primitive, PATTERN_PRIMITIVES, `${where}.primitive`),
    ...(isPositive(row.scale) ? [] : [`${where}.scale must be above 0`]),
    ...rangeProblems(row.contrast, [-CONTRAST_MAX, CONTRAST_MAX], `${where}.contrast`),
    ...rangeProblems(row.angle, [-ANGLE_MAX, ANGLE_MAX], `${where}.angle`),
  ]
}

function idProblems(row: Raw, where: string): string[] {
  return /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(String(row.id))
    ? []
    : [`${where}.id must be kebab-case`]
}

function oneOfProblems(value: unknown, allowed: readonly string[], where: string): string[] {
  return allowed.includes(value as string) ? [] : [`${where} must be one of ${allowed.join(', ')}`]
}

function rangeProblems(value: unknown, [low, high]: readonly [number, number], where: string) {
  const isInRange = typeof value === 'number' && value >= low && value <= high
  return isInRange ? [] : [`${where} must be a number in ${low}..${high}`]
}

function duplicateIdProblems(rows: readonly Raw[], list: string): string[] {
  const ids = rows.map((row) => row.id)
  return ids
    .filter((id, at) => ids.indexOf(id) !== at)
    .map((id) => `${list} share the id ${String(id)}; each needs its own`)
}

function isWholeIn(value: unknown, low: number, high: number): boolean {
  return Number.isInteger(value) && (value as number) >= low && (value as number) <= high
}

function isPositive(value: unknown): boolean {
  return typeof value === 'number' && value > 0
}
