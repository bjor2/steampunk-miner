/**
 * Which look a casing grade wears (CG2, ticket 830; the GD lock of 24 Oct on casing grades by
 * depth, Progression's row): keyed on the grade q alone, never a price, a planet or a tick. The
 * plate is `plates[(q - 1) mod P]` with P the five authored metals, so neighbouring grades always
 * differ in metal and in rivet pattern; the finish is `finishes[floor((q - 1) / P) mod F]`, cycled
 * as #577's tail cycles finishes; and the pips count the laps of that cycle, the uncapped tail,
 * drawn up to the table's `most`. Integer maths only, so any safe-integer grade answers the same on
 * every client; CG1's bigint track hands its grade here as a number once it is drawn.
 *
 * The table is read once from `casingGradeLooks.json` and refused whole when broken, every problem
 * listed (design 18: data rows the pure rule consumes).
 */
import file from './casingGradeLooks.json'
import { isHexColour } from './colour'

/** The rivet pattern a plate's metal is worked in: what tells grades apart without colour. */
export const CASING_PLATE_PATTERNS = [
  'rivet-line',
  'rivet-pairs',
  'bolt-strap',
  'lattice',
  'stagger',
] as const
export type CasingPlatePattern = (typeof CASING_PLATE_PATTERNS)[number]

/** How a hazard lining's trim is drawn over the plate's seam. */
export const CASING_TRIM_STYLES = ['seam', 'firebrick', 'stitched', 'zigzag'] as const
export type CasingTrimStyle = (typeof CASING_TRIM_STYLES)[number]

export interface CasingPlateRow {
  id: string
  /** Progression's hover word for the metal. */
  name: string
  /** `#rrggbb` of the plate body. */
  colour: string
  /** `#rrggbb` of its grooves and its seam. */
  groove: string
  /** `#rrggbb` of its rivets or bolts. */
  rivet: string
  pattern: CasingPlatePattern
}

export interface CasingFinishRow {
  id: string
  name: string
  /** The plate body's brightness against the plain finish. */
  plateScale: number
  /** A bright lip along the open face. */
  lip: boolean
  /** A dark chased band across the plate's middle. */
  chased: boolean
}

export interface CasingPipsRow {
  /** The most pips drawn; the rule still counts past it. */
  most: number
  depthTiles: number
  radiusTiles: number
}

export interface CasingTrimRow {
  name: string
  style: CasingTrimStyle
  /** How deep the trim band lies against the rock, in tiles. */
  widthTiles: number
  /** `#rrggbb`, or null for the plate's own groove colour (the standard seam). */
  colour: string | null
  /** `#rrggbb` of the trim's joints, stitches or strap line; null for none. */
  joint: string | null
}

export interface CasingLookTable {
  plates: readonly CasingPlateRow[]
  finishes: readonly CasingFinishRow[]
  pips: CasingPipsRow
  /** By lining type id (`liningTypes()`), the standard lining among them. */
  trims: Readonly<Record<string, CasingTrimRow>>
}

/** What grade q wears. */
export interface CasingGradeLook {
  grade: number
  plateIndex: number
  plate: CasingPlateRow
  finishIndex: number
  finish: CasingFinishRow
  /** Laps of the finish cycle: the uncapped tail. */
  pips: number
  /** The pips drawn, held to the table's `most`. */
  drawnPips: number
}

/** The shader draws exactly this many plate slots; the table must fill them. */
export const CASING_PLATE_SLOTS = 5
/** The shader's finish slots: a cycle this long at most. */
export const CASING_FINISH_SLOTS = 4
export const STANDARD_TRIM_ID = 'standard'

export function casingGradeLookOf(
  grade: number,
  table: CasingLookTable = CASING_GRADE_LOOKS,
): CasingGradeLook {
  assertDrawableGrade(grade)
  const plateIndex = (grade - 1) % table.plates.length
  const lap = Math.floor((grade - 1) / table.plates.length)
  const finishIndex = lap % table.finishes.length
  const pips = Math.floor(lap / table.finishes.length)
  return {
    grade,
    plateIndex,
    plate: table.plates[plateIndex],
    finishIndex,
    finish: table.finishes[finishIndex],
    pips,
    drawnPips: Math.min(pips, table.pips.most),
  }
}

/** Grades at and past this one all draw the same pips; the rule still counts theirs. */
export function firstGradeWithFullPips(table: CasingLookTable = CASING_GRADE_LOOKS): number {
  return table.pips.most * table.plates.length * table.finishes.length + 1
}

/** The trim a lining type's rings wear over their plate; the standard seam for a type with none. */
export function casingTrimOf(
  liningType: string,
  table: CasingLookTable = CASING_GRADE_LOOKS,
): CasingTrimRow {
  return table.trims[liningType] ?? table.trims[STANDARD_TRIM_ID]
}

export function readCasingLookTable(raw: unknown): CasingLookTable {
  const problems = casingLookTableProblemsOf(raw)
  if (problems.length > 0) {
    throw new Error(`casingGradeLooks.json is refused:\n- ${problems.join('\n- ')}`)
  }
  return raw as CasingLookTable
}

/** Why the table cannot load; empty for a sound one. */
export function casingLookTableProblemsOf(raw: unknown): string[] {
  if (!isRecord(raw)) return ['the table is not an object']
  return [
    ...plateProblemsOf(raw.plates),
    ...finishProblemsOf(raw.finishes),
    ...pipsProblemsOf(raw.pips),
    ...trimProblemsOf(raw.trims),
  ]
}

function plateProblemsOf(plates: unknown): string[] {
  if (!Array.isArray(plates)) return ['plates is not a list']
  const rows = plates.filter(isRecord)
  return [
    ...(plates.length === CASING_PLATE_SLOTS
      ? []
      : [`plates holds ${plates.length} rows, the shader draws ${CASING_PLATE_SLOTS}`]),
    ...(rows.length === plates.length ? [] : ['a plate is not an object']),
    ...rows.flatMap((row, at) => plateRowProblemsOf(row, at)),
    ...duplicateProblemsOf(rows.map((row) => row.id), 'plate id'),
    ...duplicateProblemsOf(rows.map((row) => row.pattern), 'plate pattern'),
    ...duplicateProblemsOf(rows.map((row) => row.colour), 'plate colour'),
  ]
}

function plateRowProblemsOf(row: Record<string, unknown>, at: number): string[] {
  const where = `plate ${at}`
  return [
    ...idProblemsOf(row, where),
    ...colourProblemsOf(row.colour, `${where} colour`),
    ...colourProblemsOf(row.groove, `${where} groove`),
    ...colourProblemsOf(row.rivet, `${where} rivet`),
    ...(isOneOf(row.pattern, CASING_PLATE_PATTERNS)
      ? []
      : [`${where} pattern ${JSON.stringify(row.pattern)} is not one the shader draws`]),
  ]
}

function finishProblemsOf(finishes: unknown): string[] {
  if (!Array.isArray(finishes)) return ['finishes is not a list']
  const rows = finishes.filter(isRecord)
  return [
    ...(finishes.length >= 2 && finishes.length <= CASING_FINISH_SLOTS
      ? []
      : [`finishes holds ${finishes.length} rows, the cycle takes 2 to ${CASING_FINISH_SLOTS}`]),
    ...(rows.length === finishes.length ? [] : ['a finish is not an object']),
    ...rows.flatMap((row, at) => finishRowProblemsOf(row, at)),
    ...duplicateProblemsOf(rows.map((row) => row.id), 'finish id'),
    ...duplicateProblemsOf(rows.map(finishMarksOf), 'finish look'),
  ]
}

function finishRowProblemsOf(row: Record<string, unknown>, at: number): string[] {
  const where = `finish ${at}`
  return [
    ...idProblemsOf(row, where),
    ...(isPositive(row.plateScale) ? [] : [`${where} plateScale is not above 0`]),
    ...(typeof row.lip === 'boolean' ? [] : [`${where} lip is not a boolean`]),
    ...(typeof row.chased === 'boolean' ? [] : [`${where} chased is not a boolean`]),
  ]
}

/** Two finishes that draw alike would make grades a lap apart match. */
function finishMarksOf(row: Record<string, unknown>): string {
  return `${row.plateScale}/${row.lip}/${row.chased}`
}

function pipsProblemsOf(pips: unknown): string[] {
  if (!isRecord(pips)) return ['pips is not an object']
  return [
    ...(Number.isInteger(pips.most) && (pips.most as number) >= 1 ? [] : ['pips.most is not 1 or more']),
    ...(isPositive(pips.depthTiles) ? [] : ['pips.depthTiles is not above 0']),
    ...(isPositive(pips.radiusTiles) ? [] : ['pips.radiusTiles is not above 0']),
  ]
}

function trimProblemsOf(trims: unknown): string[] {
  if (!isRecord(trims)) return ['trims is not an object']
  return [
    ...(STANDARD_TRIM_ID in trims ? [] : [`trims has no ${STANDARD_TRIM_ID} row`]),
    ...Object.entries(trims).flatMap(([id, row]) => trimRowProblemsOf(id, row)),
  ]
}

function trimRowProblemsOf(id: string, row: unknown): string[] {
  const where = `trim ${id}`
  if (!isRecord(row)) return [`${where} is not an object`]
  return [
    ...(isName(row.name) ? [] : [`${where} name is not a short name`]),
    ...(isOneOf(row.style, CASING_TRIM_STYLES)
      ? []
      : [`${where} style ${JSON.stringify(row.style)} is not one the shader draws`]),
    ...(isPositive(row.widthTiles) ? [] : [`${where} widthTiles is not above 0`]),
    ...(row.colour === null ? [] : colourProblemsOf(row.colour, `${where} colour`)),
    ...(row.joint === null ? [] : colourProblemsOf(row.joint, `${where} joint`)),
  ]
}

function idProblemsOf(row: Record<string, unknown>, where: string): string[] {
  return [
    ...(typeof row.id === 'string' && /^[a-z][a-z0-9-]*$/.test(row.id)
      ? []
      : [`${where} id ${JSON.stringify(row.id)} is not kebab-case`]),
    ...(isName(row.name) ? [] : [`${where} name is not a short name`]),
  ]
}

function colourProblemsOf(value: unknown, where: string): string[] {
  return isHexColour(value) ? [] : [`${where} ${JSON.stringify(value)} is not #rrggbb`]
}

function duplicateProblemsOf(values: readonly unknown[], what: string): string[] {
  const seen = new Set<unknown>()
  const twice = new Set<unknown>()
  values.forEach((value) => (seen.has(value) ? twice : seen).add(value))
  return [...twice].map((value) => `${what} ${JSON.stringify(value)} appears twice`)
}

/** Progression's band words: 3 words at most (#577). */
function isName(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0 && value.trim().split(/\s+/).length <= 3
}

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === 'string' && (options as readonly string[]).includes(value)
}

function isPositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertDrawableGrade(grade: number): void {
  if (!Number.isSafeInteger(grade) || grade < 1) {
    throw new RangeError(`a drawn casing grade is a safe integer of 1 or more, got ${grade}`)
  }
}

export const CASING_GRADE_LOOKS: CasingLookTable = readCasingLookTable(file)
