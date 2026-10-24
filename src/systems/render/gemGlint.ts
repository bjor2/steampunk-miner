/**
 * The gem rank glint (ticket 786; GD lock on #746 item 2, TD ruling 6374381455, HS and VS
 * conditions recorded there): a gem's tile twinkles by its rank k within its planet, cheapest
 * first, from `gemGlint.json`. The only input is k, a small whole number read from the planet's
 * price table by the roster; never the planet, tier or price, so the ladder is the same on every
 * planet and at any planet index. Within the authored steps the glint's strength, sparkle count
 * and covered share rise with k; past them it holds the last step (VS: bounded fall-through) and
 * the ranks above show as a finish cycle plus pips (HS, the #576 ladder): pips 1 to `most` in the
 * finish tint, the finish moving on each lap of the pips and starting over after the last, so
 * neighbouring ranks always differ and no rank grows brighter forever.
 *
 * A glint rides the look table's fourth float as a whole code (`kindLookTable.ts`); the shader
 * reads the steps, tint and finishes as constant tables built from this file
 * (`terrainKindShader.ts`). Look only: no price, gate, income, save or digest reads it.
 */
import { hexOfRgb, hueOf, isHexColour, rgbOfHex, type Rgb } from './colour'
import glintFile from './gemGlint.json'

export interface GemGlintStep {
  /** The sparkles' emissive peak. */
  strength: number
  /** Sparkles a tile. */
  sparkles: number
  /** A sparkle's half arm length, in tiles. */
  size: number
}

export interface GemGlintCaps {
  strength: number
  /** The most sparkles a step may draw: the shader's loop bound. */
  sparkles: number
  /** The largest share of the tile a step's sparkles may cover (`glintCoverageOf`). */
  coverage: number
}

export interface GemGlintPips {
  /** Pips a finish counts up to before the next finish (GD on #576: at most 6). */
  most: number
  /** In tiles. */
  radius: number
  /** Centre to centre, in tiles. */
  pitch: number
}

export interface GemGlintLadder {
  /** Indexed by rank k. */
  steps: readonly GemGlintStep[]
  caps: GemGlintCaps
  tint: Rgb
  finishes: readonly Rgb[]
  pips: GemGlintPips
}

/** Where a rank sits on the ladder: its step, and past the steps its pips and finish. */
export interface GemGlint {
  /** The step drawn: k, or the last step past them. */
  step: number
  /** 0 within the steps, else 1 to `pips.most`. */
  pips: number
  /** 0 within the steps (the ladder's tint), else 1 to the number of finishes. */
  finish: number
}

/**
 * The most codes a ladder may use, so a code times the look table's glint flag stays a whole
 * number a float holds exactly (`kindLookTable.ts`).
 */
export const GEM_GLINT_CODES_MOST = 4096
/** The GD's pip cap on the #576 ladder. */
export const GEM_GLINT_PIPS_MOST = 6
/** A pip row this wide or less sits inside the tile with its rock showing round it. */
export const PIP_ROW_SPAN_TILES = 0.8
/**
 * The smallest a mark of the glint may draw on screen and still read, in pixels: a pip and a
 * sparkle's arm 2 px across, a gap between pips 1 px. My choice for ticket 786 (no house floor
 * names one); the screens are the gem-read ones of ticket 785 (`gemRead.ts`).
 */
export const GLINT_MARK_PX = 2
export const PIP_GAP_PX = 1

type Raw = Record<string, unknown>

export const GEM_GLINT: GemGlintLadder = loadGemGlintLadder(glintFile)

export function loadGemGlintLadder(raw: unknown): GemGlintLadder {
  const problems = gemGlintLadderProblems(raw)
  if (problems.length > 0) throw new Error(`gemGlint.json is refused:\n${problems.join('\n')}`)
  return ladderOfFile(raw as Raw)
}

/** Where rank k sits on the ladder; throws on a rank that is not a whole number from 0. */
export function gemGlintOf(rank: number, ladder: GemGlintLadder = GEM_GLINT): GemGlint {
  if (!isRank(rank)) throw new Error(`a gem rank is a whole number from 0, not ${rank}`)
  const top = ladder.steps.length - 1
  if (rank <= top) return { step: rank, pips: 0, finish: 0 }
  const above = rank - top - 1
  const { most } = ladder.pips
  return {
    step: top,
    pips: (above % most) + 1,
    finish: (Math.floor(above / most) % ladder.finishes.length) + 1,
  }
}

/** The step a glint draws, its strength and sparkles clamped to the ladder's last row. */
export function glintStepOf(glint: GemGlint, ladder: GemGlintLadder = GEM_GLINT): GemGlintStep {
  return ladder.steps[glint.step]
}

/** The whole code a glint rides the look table as, from 1; 0 is no glint. */
export function gemGlintCodeOf(glint: GemGlint, ladder: GemGlintLadder = GEM_GLINT): number {
  const steps = ladder.steps.length
  return 1 + glint.step + steps * (glint.pips + (ladder.pips.most + 1) * glint.finish)
}

/** The glint a code carries, or null for 0. */
export function gemGlintOfCode(code: number, ladder: GemGlintLadder = GEM_GLINT): GemGlint | null {
  if (code < 1) return null
  const steps = ladder.steps.length
  const pipSpan = ladder.pips.most + 1
  const above = Math.floor((code - 1) / steps)
  return {
    step: (code - 1) % steps,
    pips: above % pipSpan,
    finish: Math.floor(above / pipSpan),
  }
}

/** The largest code the ladder can write: its last step on its last finish with every pip. */
export function largestGemGlintCodeOf(ladder: GemGlintLadder = GEM_GLINT): number {
  const top = ladder.steps.length - 1
  return gemGlintCodeOf(
    { step: top, pips: ladder.pips.most, finish: ladder.finishes.length },
    ladder,
  )
}

/** The share of a tile a step's sparkles can cover: each sparkle's square of side its arms. */
export function glintCoverageOf(step: GemGlintStep): number {
  return step.sparkles * (2 * step.size) ** 2
}

/** The tint a glint's sparkles and pips draw in: the ladder's, or its finish's. */
export function glintTintOf(glint: GemGlint, ladder: GemGlintLadder = GEM_GLINT): Rgb {
  return glint.finish === 0 ? ladder.tint : ladder.finishes[glint.finish - 1]
}

/** Why the glint's marks would not read at `tilePx` pixels a tile; empty when they do. */
export function glintReadProblemsAt(ladder: GemGlintLadder, tilePx: number): string[] {
  const { radius, pitch } = ladder.pips
  const marks: [string, number, number][] = [
    ['a pip', 2 * radius * tilePx, GLINT_MARK_PX],
    ['the gap between pips', (pitch - 2 * radius) * tilePx, PIP_GAP_PX],
    ["the smallest sparkle's arms", 2 * ladder.steps[0].size * tilePx, GLINT_MARK_PX],
  ]
  return marks
    .filter(([, px, floor]) => px < floor)
    .map(
      ([mark, px, floor]) =>
        `${mark} draws ${px.toFixed(2)} px at ${tilePx} px a tile, under ${floor}`,
    )
}

/**
 * The ladder's tints whose hue falls in a reserved band (the heat and enemy hues of #151, which
 * the `ore-visuals` slice holds), as problems; empty when every tint keeps out of them.
 */
export function glintHueProblemsOf(
  ladder: GemGlintLadder,
  reservedHueBands: readonly (readonly [number, number])[],
): string[] {
  return [ladder.tint, ...ladder.finishes].flatMap((tint) =>
    reservedHueBands
      .filter((band) => isHueInBand(hueOf(tint), band))
      .map(([low, high]) => `${hexOfRgb(tint)}'s hue falls in the reserved ${low}-${high} degrees`),
  )
}

function isHueInBand(hue: number, [low, high]: readonly [number, number]): boolean {
  return hue >= low && hue <= high
}

/** Why a file is not a glint ladder; empty when it may ship. */
export function gemGlintLadderProblems(raw: unknown): string[] {
  const file = (raw ?? {}) as Raw
  const shape = fileShapeProblems(file)
  if (shape.length > 0) return shape
  return stepRuleProblems(file)
}

function fileShapeProblems(file: Raw): string[] {
  return [
    ...stepListProblems(file.steps),
    ...capsProblems(file.caps),
    ...colourProblems(file.tint, 'tint'),
    ...finishesProblems(file.finishes),
    ...pipsProblems(file.pips),
  ]
}

/** Each step within the caps, then the ladder rising and fitting the table's codes. */
function stepRuleProblems(file: Raw): string[] {
  const caps = file.caps as GemGlintCaps
  const rows = (file.steps as Raw[]).flatMap((row, at) => stepProblems(row, at, caps))
  if (rows.length > 0) return rows
  return [...risingProblems(file.steps as GemGlintStep[]), ...codeRoomProblems(file)]
}

function stepListProblems(raw: unknown): string[] {
  return Array.isArray(raw) && raw.length > 0 ? [] : ['steps must be a list of at least one step']
}

function ladderOfFile(file: Raw): GemGlintLadder {
  const steps = file.steps as GemGlintStep[]
  return {
    steps: steps.map(({ strength, sparkles, size }) => ({ strength, sparkles, size })),
    caps: { ...(file.caps as GemGlintCaps) },
    tint: rgbOfHex(file.tint as string),
    finishes: (file.finishes as string[]).map(rgbOfHex),
    pips: { ...(file.pips as GemGlintPips) },
  }
}

function isRank(rank: number): boolean {
  return Number.isInteger(rank) && rank >= 0
}

function capsProblems(raw: unknown): string[] {
  const caps = (raw ?? {}) as Raw
  return [
    ...shareProblems(caps.strength, 'caps.strength'),
    ...wholeProblems(caps.sparkles, 1, Number.MAX_SAFE_INTEGER, 'caps.sparkles'),
    ...shareProblems(caps.coverage, 'caps.coverage'),
  ]
}

function stepProblems(row: Raw, at: number, caps: GemGlintCaps): string[] {
  const where = `steps[${at}]`
  const shape = [
    ...unknownFieldProblems(row, ['strength', 'sparkles', 'size'], where),
    ...shareProblems(row.strength, `${where}.strength`),
    ...wholeProblems(row.sparkles, 1, caps.sparkles, `${where}.sparkles`),
    ...shareProblems(row.size, `${where}.size`),
  ]
  if (shape.length > 0) return shape
  return capProblems(row as unknown as GemGlintStep, caps, where)
}

function capProblems(step: GemGlintStep, caps: GemGlintCaps, where: string): string[] {
  return [
    ...(step.strength <= caps.strength ? [] : [`${where}.strength is over caps.strength`]),
    ...(glintCoverageOf(step) <= caps.coverage ? [] : [`${where} covers over caps.coverage`]),
  ]
}

/** The VS's assert: strength, sparkle count and covered share rise strictly over the steps. */
function risingProblems(steps: readonly GemGlintStep[]): string[] {
  return steps.slice(1).flatMap((step, at) => {
    const below = steps[at]
    const where = `steps[${at + 1}]`
    return [
      ...(step.strength > below.strength ? [] : [`${where}.strength must rise`]),
      ...(step.sparkles > below.sparkles ? [] : [`${where}.sparkles must rise`]),
      ...(glintCoverageOf(step) > glintCoverageOf(below) ? [] : [`${where} must cover more`]),
    ]
  })
}

function codeRoomProblems(file: Raw): string[] {
  const largest = largestGemGlintCodeOf(ladderOfFile(file))
  return largest < GEM_GLINT_CODES_MOST
    ? []
    : [`the ladder needs code ${largest}, the look table holds under ${GEM_GLINT_CODES_MOST}`]
}

function finishesProblems(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length === 0) return ['finishes must be a list of colours']
  const colours = raw.flatMap((colour, at) => colourProblems(colour, `finishes[${at}]`))
  const distinct = new Set(raw).size === raw.length ? [] : ['finishes must differ']
  return [...colours, ...distinct]
}

function pipsProblems(raw: unknown): string[] {
  const pips = (raw ?? {}) as Raw
  const shape = [
    ...wholeProblems(pips.most, 1, GEM_GLINT_PIPS_MOST, 'pips.most'),
    ...shareProblems(pips.radius, 'pips.radius'),
    ...shareProblems(pips.pitch, 'pips.pitch'),
  ]
  if (shape.length > 0) return shape
  const { most, radius, pitch } = pips as unknown as GemGlintPips
  return [
    ...(pitch > 2 * radius ? [] : ['pips.pitch must leave a gap between pips']),
    ...((most - 1) * pitch + 2 * radius <= PIP_ROW_SPAN_TILES
      ? []
      : [`a row of pips.most pips must fit in ${PIP_ROW_SPAN_TILES} of a tile`]),
  ]
}

function colourProblems(value: unknown, where: string): string[] {
  return isHexColour(value) ? [] : [`${where} must be a #rrggbb colour`]
}

/** A number above 0 and at most 1. */
function shareProblems(value: unknown, where: string): string[] {
  const isShare = typeof value === 'number' && value > 0 && value <= 1
  return isShare ? [] : [`${where} must be above 0 and at most 1`]
}

function wholeProblems(value: unknown, least: number, most: number, where: string): string[] {
  const isWhole = Number.isInteger(value) && (value as number) >= least && (value as number) <= most
  return isWhole ? [] : [`${where} must be a whole number in ${least}..${most}`]
}

function unknownFieldProblems(row: Raw, fields: readonly string[], where: string): string[] {
  return Object.keys(row)
    .filter((field) => !fields.includes(field))
    .map((field) => `${where} has the unknown field ${field}`)
}
