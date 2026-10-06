/**
 * The ore grade of a tier (#140 "Ore identity", #151): 1 Raw, 2 Lustrous, 3 Crystal, 4 Lumen,
 * 5 Aether, on the `oreGrades` thresholds of `artDirection.json` ([4, 12, 30, 70]). A look axis
 * only: value and hardness never read it. The icon set shows it as an inset.
 */
import { ART_DIRECTION } from './artDirection'

export const ORE_GRADE_NAMES = ['Raw', 'Lustrous', 'Crystal', 'Lumen', 'Aether'] as const

export function oreGradeOf(tier: number): number {
  return 1 + ART_DIRECTION.oreGrades.filter((first) => tier >= first).length
}

export function oreGradeNameOf(tier: number): string {
  return ORE_GRADE_NAMES[oreGradeOf(tier) - 1]
}
