/**
 * The casing_cement grades (GD ruling and TD lock on #157, 14 Oct; ticket 366): the hazard linings
 * are casing_cement's grades, not items of their own. Grade `G` is the `G`th type in
 * `casing.cementGrades.liningTypes` and opens on that type's existing schedule row
 * (`refractory_lining` P8, `insulated_lining` P17, `grounded_lining` P25); there is no new id or
 * row. A grade's hazard behaviour stays with its archetype (`heatEconomy.ts`).
 *
 * Prices follow Systems' non-drill Mark curve (#161 section 3): a fixed count of grades, each
 * `oreUnits * gradeRatio^min(G - 1, gradeDepthCap)` band ore units at the purchase planet, so the
 * multiplier never passes `gradeRatio^gradeDepthCap`. No income cap counts them and nothing here
 * reads depth or sigma beyond the band ore's own worth.
 */
import { mul, type BigStat } from '../money'
import { compoundRatio } from './curveFamilies'
import { readBandOreCost, type FieldReader } from './economyFieldReader'
import type { BandOreCost } from './economyDefinition'

export interface CasingCementGrades {
  /** The lining type of each grade, grade 1 first. */
  liningTypes: readonly string[]
  /** Grade 1's price. */
  gradeCost: BandOreCost
  /** The price ratio per grade past the first. */
  gradeRatio: BigStat
  /** Grades past this many steps stop raising the multiplier (the Mark depth cap). */
  gradeDepthCap: number
}

/** How many grades casing_cement has: fixed, never generated. */
export function cementGradeCountOf(grades: CasingCementGrades): number {
  return grades.liningTypes.length
}

/** The grade a lining type is, 1 first; null for a type no grade names (the standard lining). */
export function cementGradeOfType(grades: CasingCementGrades, liningType: string): number | null {
  const index = grades.liningTypes.indexOf(liningType)
  return index < 0 ? null : index + 1
}

/** What grade `grade` costs in band ore units, before the purchase planet's ore value. */
export function cementGradeOreCostOf(grades: CasingCementGrades, grade: number): BandOreCost {
  if (!isCementGrade(grades, grade)) throw new RangeError(`casing_cement has no grade ${grade}`)
  const steps = Math.min(grade - 1, grades.gradeDepthCap)
  const { band, oreUnits } = grades.gradeCost
  return { band, oreUnits: mul(oreUnits, compoundRatio(grades.gradeRatio, steps)) }
}

/** The lining types of hazard acts that no grade carries: each must be one (ticket 366). */
export function liningTypesWithoutGrade(
  grades: CasingCementGrades,
  archetypeLiningTypes: readonly string[],
): string[] {
  return archetypeLiningTypes.filter((liningType) => !grades.liningTypes.includes(liningType))
}

export function readCasingCementGrades(reader: FieldReader, value: unknown): CasingCementGrades {
  const path = 'casing.cementGrades'
  const grades = reader.object(path, value)
  const read: CasingCementGrades = {
    liningTypes: reader
      .list(`${path}.liningTypes`, grades.liningTypes)
      .map((type, index) => reader.text(`${path}.liningTypes[${index}]`, type)),
    gradeCost: readBandOreCost(reader, `${path}.gradeCost`, grades.gradeCost),
    gradeRatio: reader.money(`${path}.gradeRatio`, grades.gradeRatio),
    gradeDepthCap: reader.safeInteger(`${path}.gradeDepthCap`, grades.gradeDepthCap),
  }
  if (read.liningTypes.length === 0) reader.record(`${path}.liningTypes must list a grade`)
  return read
}

function isCementGrade(grades: CasingCementGrades, grade: number): boolean {
  return Number.isSafeInteger(grade) && grade >= 1 && grade <= cementGradeCountOf(grades)
}
