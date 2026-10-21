/**
 * Each planet's hazard on its planet registry row (ticket 651, spec #647; the Horizontal Scaler's
 * "one per-planet data row" and the Game Director's bar that a planet's hazard shows within a
 * minute of landing): `ores.economy.json` `planets.rows[].hazard`, on planets 2 to 5 and never on
 * planet 1, which stays byte-identical.
 *
 * - `kind`: a row of `planets.hazards` (`hazardKinds.ts`); no two planets share one.
 * - `fromDepth`, `toDepth`: the depth window as fractions of the radius, `[num, den]`, read as
 *   `floor(num * R / den)` whole cells from the surface (the TD's integer fraction rule on #302),
 *   so a bigger planet keeps the hazard in the same place of its descent. The window opens below
 *   the pinned surface layer and inside band 1, so the first shaft meets it.
 * - `pocketTiles`, `pocketChanceBp`: the pocket lattice, as lava's (#113): plain ground is cut
 *   into square blocks and a block is a pocket with the chance, from the block's own hash. The pad
 *   view holds several pockets on average, so one is seen within the first minute.
 * - `tag`, `arrivalLine`: the planet card's read (ticket 343), in the ledger voice of #159: the
 *   tag, a full stop, one clause, no digits, at most `CARD_LINE_CHARACTERS` so it wraps to two
 *   lines on the 360 px card. Ticket 654 shows it keyed by this row.
 *
 * Nothing generates or shows a hazard yet: ticket 652 paints the pockets and ticket 654 the card.
 */
import { hazardKindProblems, isWholeBetween } from './hazardKinds'
import type { PlanetRows } from './planetRows'

/** `[num, den]`: a depth as a fraction of the radius, whole numbers with 1 <= num < den. */
export type DepthFraction = readonly [num: number, den: number]

export interface PlanetHazard {
  kind: string
  /** The planet card's tag, as "Rockfall". */
  tag: string
  /** The line the card reads on arrival; opens with the tag. */
  arrivalLine: string
  fromDepth: DepthFraction
  toDepth: DepthFraction
  /** The pocket lattice's block side in tiles. */
  pocketTiles: number
  /** The chance a block of the window is a pocket, in basis points. */
  pocketChanceBp: number
}

/** The window in whole cells of depth from the surface, `fromCells` inclusive, `toCells` exclusive. */
export interface DepthWindowCells {
  fromCells: number
  toCells: number
}

type Raw = Record<string, unknown>

const ROWS_PATH = 'ore.planets.rows'
const FIRST_HAZARD_PLANET = 2
const LAST_REQUIRED_HAZARD_PLANET = 5
const HAZARD_FIELDS = [
  'kind',
  'tag',
  'arrivalLine',
  'fromDepth',
  'toDepth',
  'pocketTiles',
  'pocketChanceBp',
]
const BASIS_POINTS = 10000
const MIN_POCKET_TILES = 2
const MAX_POCKET_TILES = 8
/** One or two words in sentence case, as the shops name hardware. */
const TAG = /^[A-Z][a-z]+( [a-z]+)?$/
const MAX_TAG_CHARACTERS = 12
/** About 38 characters fit a line of the 360 px card, and a read takes two lines at most. */
export const CARD_LINE_CHARACTERS = 64

/** Why the rows' hazards and the kind table are not #651's data; empty when they are. */
export function planetHazardProblems(planets: unknown, rows: unknown): string[] {
  const block = isPlainMap(planets) ? planets : {}
  const list = Array.isArray(rows) && rows.length > 0 ? rows.map(rawRowOf) : null
  return [
    ...hazardKindProblems(block.hazards, block.hazardCaps),
    ...(list === null ? [] : rowHazardProblems(list, kindIdsOf(block.hazards))),
  ]
}

/** The row's hazard typed, or null where it has none; call only on rows the guards accept. */
export function planetHazardOf(row: Raw): PlanetHazard | null {
  const hazard = row.hazard as Raw | undefined
  if (hazard === undefined) return null
  const [fromNum, fromDen] = hazard.fromDepth as number[]
  const [toNum, toDen] = hazard.toDepth as number[]
  return {
    kind: hazard.kind as string,
    tag: hazard.tag as string,
    arrivalLine: hazard.arrivalLine as string,
    fromDepth: [fromNum, fromDen],
    toDepth: [toNum, toDen],
    pocketTiles: hazard.pocketTiles as number,
    pocketChanceBp: hazard.pocketChanceBp as number,
  }
}

/** The planet's hazard, or null where its row holds none (planet 1, and past planet 5 today). */
export function hazardOfPlanet(planets: PlanetRows, planetIndex: number): PlanetHazard | null {
  return planets.rows[planetIndex - 1]?.hazard ?? null
}

/** The hazard's depth window on a planet of `radiusTiles`: `floor(num * R / den)` each end. */
export function hazardDepthWindowCellsOf(
  hazard: PlanetHazard,
  radiusTiles: number,
): DepthWindowCells {
  return {
    fromCells: depthCellsOf(hazard.fromDepth, radiusTiles),
    toCells: depthCellsOf(hazard.toDepth, radiusTiles),
  }
}

function depthCellsOf([num, den]: DepthFraction, radiusTiles: number): number {
  return Math.floor((num * radiusTiles) / den)
}

function rowHazardProblems(rows: readonly Raw[], kindIds: readonly string[]): string[] {
  return rows.flatMap((row, at) => {
    const where = `${ROWS_PATH}[${at}].hazard`
    const planet = at + 1
    if (row.hazard === undefined) return missingProblems(where, planet)
    if (planet < FIRST_HAZARD_PLANET) {
      return [`${where}: planet 1 stays byte-identical and holds no hazard`]
    }
    return hazardShapeProblems(where, row.hazard, kindIds, earlierKindsOf(rows, at))
  })
}

function missingProblems(where: string, planet: number): string[] {
  const isRequired = planet >= FIRST_HAZARD_PLANET && planet <= LAST_REQUIRED_HAZARD_PLANET
  return isRequired
    ? [
        `${where} is missing: planets ${FIRST_HAZARD_PLANET} to ${LAST_REQUIRED_HAZARD_PLANET} each hold one`,
      ]
    : []
}

/** Kind id to the first planet before `at` that carries it. */
function earlierKindsOf(rows: readonly Raw[], at: number): ReadonlyMap<string, number> {
  const earlier = new Map<string, number>()
  rows.slice(0, at).forEach((row, index) => {
    const kind = isPlainMap(row.hazard) ? row.hazard.kind : undefined
    if (typeof kind === 'string' && !earlier.has(kind)) earlier.set(kind, index + 1)
  })
  return earlier
}

function hazardShapeProblems(
  where: string,
  hazard: unknown,
  kindIds: readonly string[],
  earlier: ReadonlyMap<string, number>,
): string[] {
  if (!isPlainMap(hazard)) return [`${where} must be a hazard row`]
  return [
    ...kindProblems(where, hazard.kind, kindIds, earlier),
    ...windowProblems(where, hazard.fromDepth, hazard.toDepth),
    ...latticeProblems(where, hazard.pocketTiles, hazard.pocketChanceBp),
    ...copyProblems(where, hazard.tag, hazard.arrivalLine),
    ...Object.keys(hazard)
      .filter((field) => !HAZARD_FIELDS.includes(field))
      .map((field) => `${where}.${field} is not a hazard field`),
  ]
}

function kindProblems(
  where: string,
  kind: unknown,
  kindIds: readonly string[],
  earlier: ReadonlyMap<string, number>,
): string[] {
  if (typeof kind !== 'string' || !kindIds.includes(kind)) {
    return [`${where}.kind "${String(kind)}" is not in ore.planets.hazards`]
  }
  const planetBefore = earlier.get(kind)
  return planetBefore === undefined
    ? []
    : [`${where}.kind "${kind}" is also planet ${planetBefore}'s`]
}

function windowProblems(where: string, from: unknown, to: unknown): string[] {
  const problems = [
    ...(isDepthFraction(from) ? [] : [fractionProblem(where, 'fromDepth')]),
    ...(isDepthFraction(to) ? [] : [fractionProblem(where, 'toDepth')]),
  ]
  if (problems.length > 0) return problems
  return isAbove(from as DepthFraction, to as DepthFraction)
    ? []
    : [`${where}.fromDepth must lie above toDepth`]
}

function fractionProblem(where: string, field: string): string {
  return `${where}.${field} must be [num, den], whole, with 1 <= num < den`
}

/** `from` is the shallower depth: compared as whole numbers by cross-multiplying. */
function isAbove(from: DepthFraction, to: DepthFraction): boolean {
  return from[0] * to[1] < to[0] * from[1]
}

function latticeProblems(where: string, tiles: unknown, chanceBp: unknown): string[] {
  return [
    ...(isWholeBetween(tiles, MIN_POCKET_TILES, MAX_POCKET_TILES)
      ? []
      : [`${where}.pocketTiles must be whole, from ${MIN_POCKET_TILES} to ${MAX_POCKET_TILES}`]),
    ...(isWholeBetween(chanceBp, 1, BASIS_POINTS)
      ? []
      : [`${where}.pocketChanceBp must be whole, from 1 to ${BASIS_POINTS}`]),
  ]
}

function copyProblems(where: string, tag: unknown, line: unknown): string[] {
  const tagText = typeof tag === 'string' ? tag : ''
  const lineText = typeof line === 'string' ? line : ''
  return [
    ...(isTag(tagText)
      ? []
      : [
          `${where}.tag must be one or two capitalised words, ${MAX_TAG_CHARACTERS} characters at most`,
        ]),
    ...(isReadOf(tagText, lineText)
      ? []
      : [`${where}.arrivalLine must open with "${tagText}. " and end with a full stop`]),
    ...(/\d/.test(lineText)
      ? [`${where}.arrivalLine holds a digit: the ledger voice spells numbers out`]
      : []),
    ...(lineText.length > CARD_LINE_CHARACTERS
      ? [`${where}.arrivalLine is over ${CARD_LINE_CHARACTERS} characters, the 360 px card`]
      : []),
  ]
}

function isTag(tag: string): boolean {
  return TAG.test(tag) && tag.length <= MAX_TAG_CHARACTERS
}

/** The line is the tag, a full stop, then one clause ending in a full stop. */
function isReadOf(tag: string, line: string): boolean {
  const opening = `${tag}. `
  return line.startsWith(opening) && line.length > opening.length && line.endsWith('.')
}

function isDepthFraction(value: unknown): value is DepthFraction {
  if (!Array.isArray(value) || value.length !== 2) return false
  const [num, den] = value as unknown[]
  return (
    isWholeBetween(num, 1, Number.MAX_SAFE_INTEGER) &&
    isWholeBetween(den, 1, Number.MAX_SAFE_INTEGER) &&
    num < den
  )
}

function kindIdsOf(kinds: unknown): string[] {
  return isPlainMap(kinds) ? Object.keys(kinds) : []
}

function rawRowOf(row: unknown): Raw {
  return isPlainMap(row) ? row : {}
}

function isPlainMap(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
