/**
 * The casing look channel's per-cell value (CG2, ticket 830): how a cased cell's look rides to the
 * terrain shader in one number per tile, beside the #298 gate slot, which has one bit left. The
 * value carries what the shader draws, never the grade itself, so a grade of any size (CG1's
 * uncapped track) fits: the plate slot, the finish slot and the drawn pips, as `casingGradeLookOf`
 * works them out, plus the lining type's index (`liningTypes()`, #113) above them for the trim.
 *
 *   value = typeIndex * CASING_TYPE_UNIT + 1 + plate + P * (finish + F * drawnPips)
 *
 * 0 is a cell with no intact lining. P and F are the shader's slot counts, so the code is stable
 * whatever the table's cycle lengths. The whole value stays far below 2^24, exact in a float.
 */
import {
  CASING_FINISH_SLOTS,
  CASING_PLATE_SLOTS,
  casingGradeLookOf,
  type CasingGradeLook,
  type CasingLookTable,
} from './casingGradeLook'

/** A cell with no intact lining draws no plate. */
export const NO_CASING_LOOK = 0
/** The lining type's place value; the look code below it never reaches this. */
export const CASING_TYPE_UNIT = 256
/** The most pips the code carries: the code must stay under the type unit. */
export const CASING_LOOK_PIPS_MOST =
  Math.floor((CASING_TYPE_UNIT - 1) / (CASING_PLATE_SLOTS * CASING_FINISH_SLOTS)) - 1
/** The most lining types the channel tells apart (the value stays exact in a float). */
export const CASING_TYPE_MOST = 2 ** 24 / CASING_TYPE_UNIT - 1

/** What the shader decodes from a cell's value. */
export interface CasingLookCode {
  plateIndex: number
  finishIndex: number
  drawnPips: number
  typeIndex: number
}

/** The value for a cell holding intact lining of `grade` in the type at `typeIndex`. */
export function casingLookBitsOf(
  grade: number,
  typeIndex: number,
  table?: CasingLookTable,
): number {
  return casingLookBitsOfLook(casingGradeLookOf(grade, table), typeIndex)
}

export function casingLookBitsOfLook(look: CasingGradeLook, typeIndex: number): number {
  refuseOutOfChannel(look, typeIndex)
  const pips = Math.min(look.drawnPips, CASING_LOOK_PIPS_MOST)
  const code = look.plateIndex + CASING_PLATE_SLOTS * (look.finishIndex + CASING_FINISH_SLOTS * pips)
  return typeIndex * CASING_TYPE_UNIT + 1 + code
}

/** What a cell's value draws, or null for a cell with no lining. */
export function casingLookOfBits(bits: number): CasingLookCode | null {
  if (bits <= NO_CASING_LOOK) return null
  const code = (bits % CASING_TYPE_UNIT) - 1
  return {
    plateIndex: code % CASING_PLATE_SLOTS,
    finishIndex: Math.floor(code / CASING_PLATE_SLOTS) % CASING_FINISH_SLOTS,
    drawnPips: Math.floor(code / (CASING_PLATE_SLOTS * CASING_FINISH_SLOTS)),
    typeIndex: Math.floor(bits / CASING_TYPE_UNIT),
  }
}

export function isCasedBits(bits: number): boolean {
  return bits > NO_CASING_LOOK
}

function refuseOutOfChannel(look: CasingGradeLook, typeIndex: number): void {
  const problems = [
    ...(look.plateIndex < CASING_PLATE_SLOTS ? [] : [`plate slot ${look.plateIndex}`]),
    ...(look.finishIndex < CASING_FINISH_SLOTS ? [] : [`finish slot ${look.finishIndex}`]),
    ...(Number.isInteger(typeIndex) && typeIndex >= 0 && typeIndex <= CASING_TYPE_MOST
      ? []
      : [`lining type index ${typeIndex}`]),
  ]
  if (problems.length > 0) {
    throw new RangeError(`casing look outside the channel: ${problems.join(', ')}`)
  }
}
