/**
 * What a casing grade holds and how hard its lining is (decision #41, Systems & Economy comment):
 *   grade G supports bands 1..G; the core needs casingGradeCoreMin (5)
 *   casingHardness(p, G) = H(t(p, G))      (re-drilling lining is band-G rock on planet p)
 * Casing drops no ore and is not a vehicle track.
 *
 * A gnawed wall against collapse (Systems ruling (C) on #676, the TD pin):
 *   grade = max(1, native - min(gnaws, gnawMaxDrop))     whole grades; native = the band's grade
 */
import type { BigStat } from '../money'
import { ECONOMY } from './economy'
import { oreHardness } from './oreEconomy'

const { casing, ore } = ECONOMY
const FIRST_PLANET = 1

/** Hardness of a lining sample of `grade` on planet `planetIndex`: band-G hardness, `H(t(p, G))`. */
export function casingHardness(planetIndex: number, grade: number): BigStat {
  assertGrade(grade)
  return oreHardness(ore.tiersPerPlanet * (planetIndex - FIRST_PLANET) + grade)
}

/** The least grade that holds band `band` (1 to 5), or the core when `band` is the core band. */
export function requiredCasingGrade(band: number): number {
  return band >= ore.coreTierBand ? casing.casingGradeCoreMin : band
}

/** The least grade a gnawed wall holds: the first grade lining is laid at. */
export const GNAWED_GRADE_FLOOR = casing.casingGradeStart

/**
 * What a wall of native grade `nativeGrade` holds against collapse after `gnaws` wrecker gnaws:
 * at most `maxDrop` grades less, never below `GNAWED_GRADE_FLOOR`. Worked out on read, never saved.
 */
export function gnawedCasingGrade(
  nativeGrade: number,
  gnaws: number,
  maxDrop: number = casing.gnawMaxDrop,
): number {
  return Math.max(GNAWED_GRADE_FLOOR, nativeGrade - Math.min(gnaws, maxDrop))
}

export function isCasingGradeEnough(grade: number, band: number): boolean {
  return grade >= requiredCasingGrade(band)
}

function assertGrade(grade: number): void {
  if (!Number.isSafeInteger(grade) || grade < casing.casingGradeStart) {
    throw new RangeError(`a casing grade must be a safe integer >= 1, got ${grade}`)
  }
}
