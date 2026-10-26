/**
 * Which grade a casing sample's 4-bit grade field names (ticket 829: each laid cell keeps the grade
 * it was laid at on an uncapped ladder, and the HS: old saves map to the current ids). A sample
 * holds a slot of 1 to 15 in its planet's window of grades:
 *
 *   grade = windowBase(p) + slot      windowBase(p) = max(0, q_surface(p) - 7)
 *
 * so planets 1 and 2 (q_surface 1 and 5) keep the slot as the grade, byte for byte with every
 * layer and save before the ladder, and planet `p` holds grades `q_surface - 6` to `q_surface + 8`.
 * The planet asks at most `q_surface + 5` (its last band and a biome's +1), so every grade above the
 * window holds all of it, and every grade below it is at least 6 short at the surface, where the
 * burst's hold is already its 1 s floor (`casingBurst.ts`): clamping a laid grade into the window
 * never changes what a wall holds or how soon it bursts. Only the look of a far older or far newer
 * grade than the planet asks is drawn at the window's edge. A world is one planet's (another
 * planet's deltas start empty, `planetEntry.ts`), so no layer ever crosses windows.
 */
import { casingSurfaceGradeOf } from '../registries/planetRow'
import { MAX_SAMPLE_CASING_GRADE } from './chunkDelta'

/** The window starts this many grades under the surface grade: slot 1 is 6 grades short of it. */
const GRADES_BELOW_SURFACE = 7n
const FIRST_SLOT = 1n
const LAST_SLOT = BigInt(MAX_SAMPLE_CASING_GRADE)

/** The grade under the window's first slot on planet `planetIndex`. */
export function casingWindowBaseOf(planetIndex: number): bigint {
  const base = casingSurfaceGradeOf(planetIndex) - GRADES_BELOW_SURFACE
  return base > 0n ? base : 0n
}

/** The slot a sample laid at `grade` holds on planet `planetIndex`: clamped into the window. */
export function casingSlotOfGrade(planetIndex: number, grade: bigint): number {
  const slot = grade - casingWindowBaseOf(planetIndex)
  if (slot < FIRST_SLOT) return Number(FIRST_SLOT)
  return Number(slot > LAST_SLOT ? LAST_SLOT : slot)
}

/** The grade a sample's slot names on planet `planetIndex`; slot 0 (no grade) names 0. */
export function casingGradeOfSlot(planetIndex: number, slot: number): bigint {
  return slot === 0 ? 0n : casingWindowBaseOf(planetIndex) + BigInt(slot)
}
