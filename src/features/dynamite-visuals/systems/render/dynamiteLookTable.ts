/**
 * The dynamite look rows (D7, ticket 866; the GD lock of 25 Oct on #647, "types are verbs with
 * their own stick colour, sparks and decal"): one row per charge type of the kernel ladder, the
 * fuse's sparks, the Blast Casing look row and the Blast Radius look row, read once from
 * `dynamiteLooks.json` and refused whole when broken, every problem listed (design 18: data rows the
 * pure rules consume). The table is the per-upgrade look check's row for the `blasting_charges`
 * line (ticket 809): every type has a row, no row names a type the ladder lacks, the names are band
 * names of 3 words or fewer, and the stick colours stand apart in luma (ticket 830's colour-blind
 * rule), so a type reads in grey at 360 px.
 */
import { isHexColour, lumaOf, rgbOfHex } from '../../../../systems/render/colour'
import file from '../../dynamiteLooks.json'

export interface ChargeTypeLookRow {
  type: number
  /** Progression's band name for the type: 3 words or fewer. */
  name: string
  /** `#rrggbb` of every size's body, planted and on the rack. */
  stick: string
  /** `#rrggbb` of the fuse's sparks and the lamp glass. */
  spark: string
  /** `#rrggbb` of the placed ring's line. */
  ring: string
  /** `#rrggbb` the crater decal is tinted in. */
  soot: string
  /** The decal part in the crater asset. */
  crater: string
}

export interface FuseSparkRow {
  sparksPerSecond: number
  lifeSeconds: number
  speedMetresPerSecond: number
}

/** The Blast Casing look row (#862 D3): the rack's nozzle and the lined crater's neutral parts. */
export interface CasingLookRow {
  nozzlePart: string
  rimPart: string
  trimPart: string
}

/** The Blast Radius look row (#869 D9): growth per decade of the owned level, to a cap. */
export interface RadiusBandRow {
  growPerBand: number
  growMax: number
}

export interface DynamiteLookTable {
  types: readonly ChargeTypeLookRow[]
  fuse: FuseSparkRow
  casing: CasingLookRow
  radiusBands: RadiusBandRow
}

/** A band name is a data string of 3 words or fewer (Progression on #647). */
const BAND_NAME_WORDS_MAX = 3
/** Two stick colours this far apart in luma tell apart in grey (CG2's rule, ticket 830). */
export const STICK_LUMA_STEP_MIN = 0.1

export class DynamiteLookTableError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`dynamiteLooks.json: ${problems.join('; ')}`)
    this.name = 'DynamiteLookTableError'
  }
}

/** `table` once it passes every check against the ladder's `typeCount` types. */
export function readDynamiteLookTable(raw: unknown, typeCount: number): DynamiteLookTable {
  const problems = dynamiteLookTableProblemsOf(raw, typeCount)
  if (problems.length > 0) throw new DynamiteLookTableError(problems)
  return raw as DynamiteLookTable
}

/** Every problem with `raw`; empty for a sound table. */
export function dynamiteLookTableProblemsOf(raw: unknown, typeCount: number): string[] {
  if (!isRecord(raw)) return ['the table is not an object']
  return [
    ...typeRowsProblemsOf(raw.types, typeCount),
    ...fuseProblemsOf(raw.fuse),
    ...casingProblemsOf(raw.casing),
    ...radiusBandProblemsOf(raw.radiusBands),
  ]
}

/** The committed rows, not yet checked against the ladder; `DYNAMITE_LOOKS` in `chargeTypeLook.ts` is. */
export const DYNAMITE_LOOKS_FILE: unknown = file

function typeRowsProblemsOf(types: unknown, typeCount: number): string[] {
  if (!Array.isArray(types)) return ['types is not a list']
  const rows = types.filter(isRecord)
  return [
    ...(rows.length === types.length ? [] : ['a type row is not an object']),
    ...coverageProblemsOf(rows, typeCount),
    ...rows.flatMap((row) => typeRowProblemsOf(row)),
    ...stickLumaProblemsOf(rows),
    ...duplicateProblemsOf(
      rows.map((row) => row.crater),
      'crater part',
    ),
  ]
}

/** Types 1 to `typeCount`, each once, in order: the per-upgrade check's "every line has a row". */
function coverageProblemsOf(rows: readonly Record<string, unknown>[], typeCount: number): string[] {
  const listed = rows.map((row) => row.type)
  const wanted = Array.from({ length: typeCount }, (_, at) => at + 1)
  if (listed.length === wanted.length && listed.every((type, at) => type === wanted[at])) return []
  return [`types list ${JSON.stringify(listed)}, the ladder has types ${JSON.stringify(wanted)}`]
}

function typeRowProblemsOf(row: Record<string, unknown>): string[] {
  const problems: string[] = []
  if (!isBandName(row.name)) problems.push('name is not 1 to 3 words')
  for (const key of ['stick', 'spark', 'ring', 'soot'] as const) {
    if (!isHexColour(row[key])) problems.push(`${key} is not #rrggbb`)
  }
  if (typeof row.crater !== 'string' || row.crater === '') problems.push('crater names no part')
  return problems.map((problem) => `type ${String(row.type)}: ${problem}`)
}

/** Every pair of stick colours apart in luma, so no two types match in grey. */
function stickLumaProblemsOf(rows: readonly Record<string, unknown>[]): string[] {
  const sticks = rows.filter((row) => isHexColour(row.stick))
  return sticks.flatMap((row, at) =>
    sticks
      .slice(at + 1)
      .filter((other) => isCloseInLuma(row.stick as string, other.stick as string))
      .map(
        (other) =>
          `types ${String(row.type)} and ${String(other.type)}: sticks under ${STICK_LUMA_STEP_MIN} apart in luma`,
      ),
  )
}

function isCloseInLuma(a: string, b: string): boolean {
  return Math.abs(lumaOf(rgbOfHex(a)) - lumaOf(rgbOfHex(b))) < STICK_LUMA_STEP_MIN
}

function fuseProblemsOf(fuse: unknown): string[] {
  if (!isRecord(fuse)) return ['fuse is not an object']
  return (['sparksPerSecond', 'lifeSeconds', 'speedMetresPerSecond'] as const)
    .filter((key) => !isPositive(fuse[key]))
    .map((key) => `fuse.${key} is not a positive number`)
}

function casingProblemsOf(casing: unknown): string[] {
  if (!isRecord(casing)) return ['casing is not an object']
  const problems = (['nozzlePart', 'rimPart', 'trimPart'] as const)
    .filter((key) => typeof casing[key] !== 'string' || casing[key] === '')
    .map((key) => `casing.${key} names no part`)
  return [...problems, ...duplicateProblemsOf([casing.rimPart, casing.trimPart], 'casing part')]
}

function radiusBandProblemsOf(bands: unknown): string[] {
  if (!isRecord(bands)) return ['radiusBands is not an object']
  const problems: string[] = []
  if (!isPositive(bands.growPerBand)) problems.push('radiusBands.growPerBand is not positive')
  if (!(typeof bands.growMax === 'number' && bands.growMax >= 1)) {
    problems.push('radiusBands.growMax is under 1')
  }
  return problems
}

function duplicateProblemsOf(values: readonly unknown[], what: string): string[] {
  return values
    .filter((value, at) => values.indexOf(value) !== at)
    .map((value) => `${what} ${String(value)} is listed twice`)
}

function isBandName(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const words = value
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0)
  return words.length >= 1 && words.length <= BAND_NAME_WORDS_MAX
}

function isPositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
