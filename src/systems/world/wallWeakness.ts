/**
 * What one wall sample holds against collapse, for #57's watch (`collapseWeakness.ts`) and the
 * bore's disturbance (`boreWeakness.ts`) alike (decision #43 as amended; Systems ruling (C) on
 * #676 with the TD pin):
 *
 * - intact lining holds the grade it was laid at (its slot in the planet's window,
 *   `casingGradeWindow.ts`), and never-lined rock 0;
 * - lining a wrecker gnawed holds its band's native grade less the gnaw, at most `gnawMaxDrop`
 *   grades and never below 1 (`gnawedCasingGrade`). The native grade is the grade the wall's band
 *   needs (`requiredCasingGrade`, ticket 829), read from worldgen at the wall, never stored. The casing layer keeps only the breach
 *   (one gnaw, #111), so saves and the network protocol are unchanged.
 *
 * A wall is weak when that grade is below the band's required grade.
 */
import { gnawedCasingGrade, GNAWED_GRADE_FLOOR, requiredCasingGrade } from '../economy/casingGrades'
import { casingBandOfTile } from './casingBand'
import { casingGradeOfSlot } from './casingGradeWindow'
import { effectiveCasingGrade, isIntactLining, isLined } from './chunkDelta'
import type { BlockWeakness } from './collapseWeakness'
import type { PlanetParams } from './planetParams'
import { SAMPLES_PER_TILE } from './sampleGrid'

/** A breach is the one gnaw the casing layer records (#111): a ring gnawed again stays breached. */
const GNAWS_OF_A_BREACH = 1

/**
 * `kept`, or the wall when it is weak and lower in grade: the lower grade wins, on a tie the first
 * met stays, so a wall met again never changes the answer. The band is read only when the wall's
 * least grade could win.
 */
export function weakerWall(
  kept: BlockWeakness | null,
  casing: number,
  params: PlanetParams,
  sx: number,
  sy: number,
): BlockWeakness | null {
  const { planetIndex } = params
  if (kept !== null && leastCollapseGradeOf(planetIndex, casing) >= kept.weakestGrade) return kept
  const tile = { tx: tileOf(sx), ty: tileOf(sy) }
  const band = casingBandOfTile(params, tile.tx, tile.ty)
  const required = requiredCasingGrade({ planetIndex, band })
  const grade = collapseGradeOf(planetIndex, casing, required)
  return isWeakerWall(kept, grade, required) ? { band, weakestGrade: grade, required, tile } : kept
}

/** The grade a wall holding `casing` on planet `planetIndex` holds where `required` is needed. */
export function collapseGradeOf(planetIndex: number, casing: number, required: bigint): bigint {
  if (!isGnawed(casing)) return casingGradeOfSlot(planetIndex, effectiveCasingGrade(casing))
  return gnawedCasingGrade(required, GNAWS_OF_A_BREACH)
}

/** The lowest grade the wall could hold in any band, known before its band is read. */
function leastCollapseGradeOf(planetIndex: number, casing: number): bigint {
  if (isGnawed(casing)) return GNAWED_GRADE_FLOOR
  return casingGradeOfSlot(planetIndex, effectiveCasingGrade(casing))
}

function isWeakerWall(kept: BlockWeakness | null, grade: bigint, required: bigint): boolean {
  if (grade >= required) return false
  return kept === null || grade < kept.weakestGrade
}

/** Lining a wrecker breached: lined, holding no grade of its own. */
function isGnawed(casing: number): boolean {
  return isLined(casing) && !isIntactLining(casing)
}

function tileOf(sample: number): number {
  return Math.floor(sample / SAMPLES_PER_TILE)
}
