/**
 * How a patch draws among the kinds live on it (ticket 713, Systems' rows on #713 with Bjor's OK of
 * 23 Oct).
 *
 * - `drawWeight`: a slot's weight in the draw among the kinds live on a patch; a slot without one
 *   weighs `kinds.drawWeightDefault`. A draw whose live kinds all weigh the same is uniform, exactly
 *   the roster fold's `roll % nLive`, so a planet without weighted kinds draws every cell it drew.
 *   P1's three gems weigh 4, 3 and 2 per cluster (Systems), whose mean is the default 3: together
 *   they draw what three plain kinds would, split 4:3:2.
 *
 * Integer only.
 */

/** What a slot row may carry for the draw. */
export interface SlotDraw {
  /** Absent: the table's default weight. */
  drawWeight?: number
}

type Raw = Record<string, unknown>

/** The draw fields of a slot row `slotDrawProblems` accepts, only those it carries. */
export function slotDrawOf(row: Raw): SlotDraw {
  return row.drawWeight === undefined ? {} : { drawWeight: row.drawWeight as number }
}

/** Why a slot row's draw weight is broken; empty when it is a whole number from 1 or absent. */
export function slotDrawProblems(row: Raw, where: string): string[] {
  return isAbsentOrWhole(row.drawWeight) ? [] : [`${where}.drawWeight must be whole, from 1`]
}

/** Why the table's default draw weight is broken; empty when it is a whole number from 1. */
export function drawWeightDefaultProblems(weight: unknown): string[] {
  return isWholeFromOne(weight) ? [] : ['ore.kinds.drawWeightDefault must be whole, from 1']
}

/**
 * The position in `weights` a roll draws: `roll % n` when every weight is the same, else the slot
 * whose run of `roll % total` holds the roll, in order.
 */
export function drawnPositionOf(weights: readonly number[], roll: number): number {
  if (weights.every((weight) => weight === weights[0])) return roll % weights.length
  let left = roll % weights.reduce((sum, weight) => sum + weight, 0)
  let at = 0
  while (left >= weights[at]) left -= weights[at++]
  return at
}

function isAbsentOrWhole(value: unknown): boolean {
  return value === undefined || isWholeFromOne(value)
}

function isWholeFromOne(value: unknown): boolean {
  return Number.isSafeInteger(value) && (value as number) >= 1
}
