/**
 * How big a pop is, whether it glints and how long it flies (ticket 616, the final B bars on
 * #442): side 0.25 × 1.25^step cells, capped at 0.8 cell (G&V, HS condition 1); the top step of
 * the material table and anything at the cap glints instead of growing; the flight to the hold
 * takes 0.35 s for a common pop up to 0.5 s at the cap, so a rarer find stays in sight longer.
 * Presentation maths in floats; nothing here reaches yield, price or the authority.
 */
import {
  POP_COMMON_COLOUR,
  POP_COMMON_SIZE_CELLS,
  POP_FLIGHT_SECONDS_LONGEST,
  POP_FLIGHT_SECONDS_SHORTEST,
  POP_GLINT_BRIGHTEN,
  POP_GLINT_PER_SECOND,
  POP_SIZE_CAP_CELLS,
  POP_SIZE_STEP_RATIO,
  POP_SPECIAL_COLOUR,
} from '../../constants/materialPop'
import { rgbOfHex, type Rgb } from '../render/colour'
import { packedRgbOf } from '../render/kindLookTable'
import type { PopLane } from './popFinds'

/** The material table's rarity ladder as the pop reads it: a tint per step above common. */
export interface PopLadder {
  /** Step 1 first. */
  tints: readonly Rgb[]
  /** The highest step the table names; 0 when it names none above common. */
  topStep: number
}

export const NO_POP_LADDER: PopLadder = { tints: [], topStep: 0 }

const COMMON_COLOUR = packedRgbOf(rgbOfHex(POP_COMMON_COLOUR))
const SPECIAL_COLOUR = packedRgbOf(rgbOfHex(POP_SPECIAL_COLOUR))

export function popSizeCellsOf(step: number): number {
  return Math.min(POP_SIZE_CAP_CELLS, uncappedSizeOf(step))
}

/**
 * Whether the pop glints: from the table's top step (`topStep`, the highest rarity step it
 * names; 0 when it names none above common) and from any step the cap already holds.
 */
export function isPopGlinting(step: number, topStep: number): boolean {
  const isTopStep = topStep > 0 && step >= topStep
  return isTopStep || uncappedSizeOf(step) >= POP_SIZE_CAP_CELLS
}

/** 0xRRGGBB: a special's own colour, a rarer find's rarity tint, else brass ore. */
export function popColourOf(lane: PopLane, step: number, ladder: PopLadder): number {
  if (lane === 'special') return SPECIAL_COLOUR
  const tint = step > 0 ? ladder.tints[Math.min(step, ladder.tints.length) - 1] : undefined
  return tint === undefined ? COMMON_COLOUR : packedRgbOf(tint)
}

/** Seconds the flight to the hold takes: longer the bigger the pop, inside 0.35 to 0.5 s. */
export function popFlightSecondsOf(sizeCells: number): number {
  const span = POP_SIZE_CAP_CELLS - POP_COMMON_SIZE_CELLS
  const share = Math.min(1, Math.max(0, (sizeCells - POP_COMMON_SIZE_CELLS) / span))
  const reach = POP_FLIGHT_SECONDS_LONGEST - POP_FLIGHT_SECONDS_SHORTEST
  return POP_FLIGHT_SECONDS_SHORTEST + reach * share
}

/** Ease-in: the pop leaves its cell slowly and speeds into the hold. */
export function easeInFlight(progress: number): number {
  const clamped = Math.min(1, Math.max(0, progress))
  return clamped * clamped
}

/** The share a glinting pop is brightened by `ageSeconds` into its flight, 0 to the glint's most. */
export function popGlintAt(ageSeconds: number): number {
  return POP_GLINT_BRIGHTEN * Math.max(0, Math.sin(2 * Math.PI * POP_GLINT_PER_SECOND * ageSeconds))
}

function uncappedSizeOf(step: number): number {
  return POP_COMMON_SIZE_CELLS * Math.pow(POP_SIZE_STEP_RATIO, Math.max(0, step))
}
