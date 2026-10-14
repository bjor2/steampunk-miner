/**
 * A combo's grade and what it closes (GD lock on #206, decision 7): grade 1 is the one-off buy,
 * each later grade a research-only node the tree generates from the pair's template (`41 + 3j`).
 * Combos have no Marks; a grade closes a fixed share of what is left of a headroom, in integer bp,
 * so every grade adds something and none reaches past the cap. Which headroom is the combo's:
 * the drains' reach toward the 12-cell `reachCellsMax`, the alarm shield's trigger past the
 * periscope's radius. A ranking (the drain's order, the shifter's target, the corer's aim) has no
 * headroom, so it reads the same at every grade.
 */
import { ownsItem } from '../../../systems/authority/loadoutRules'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { researchedMarkOf } from '../../tech-tree'
import { COMBOS_ECONOMY } from './combosEconomy'

const WHOLE_BP = 10_000

/**
 * The grade the player plays the combo at: 0 while not owned, else the highest grade researched,
 * and grade 1 for a combo owned through a scenario with nothing researched.
 */
export function gradeOf(state: AuthorityState, playerId: string, itemId: string): number {
  if (!ownsItem(state, playerId, itemId)) return 0
  return Math.max(1, researchedMarkOf(state, playerId, itemId))
}

/** The share of a headroom closed by `grade`: each grade closes `shareBp` of what is left. */
export function closedHeadroomBpAt(
  grade: number,
  shareBp: number = COMBOS_ECONOMY.grades.headroomShareBp,
): number {
  let remainingBp = WHOLE_BP
  for (let step = 0; step < grade && remainingBp > 0; step++) {
    remainingBp = Math.floor((remainingBp * (WHOLE_BP - shareBp)) / WHOLE_BP)
  }
  return WHOLE_BP - remainingBp
}

/** The whole cells or tiles of `headroom` a grade has closed. */
export function closedHeadroomAt(grade: number, headroom: number): number {
  return Math.floor((Math.max(0, headroom) * closedHeadroomBpAt(grade)) / WHOLE_BP)
}
