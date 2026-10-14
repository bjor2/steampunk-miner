/**
 * A parent item's current values, as a combo reads them (#162 4.6: combos have no Marks and read
 * their parents'; GD lock on #206, decision 8): the parent's Mark is the one the player researched
 * (`researchedMarkOf`), and its value is read off the ladder its lane registered in the tree, so
 * this slice never imports the lane.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { lastMarkOf, markLadderOfItem, markStepOf, researchedMarkOf } from '../../tech-tree'
import type { MarkLadder } from '../../tech-tree'

/** Mark 1 is the item as bought (#162 4.6); none researched acts as bought. */
const BOUGHT_MARK = 1

/** The Mark the player plays the parent at. */
export function parentMarkOf(state: AuthorityState, playerId: string, itemId: string): number {
  return Math.max(BOUGHT_MARK, researchedMarkOf(state, playerId, itemId))
}

/** The parent's magnitude at `mark` (a sounder's radius, a corer's reach); null with none. */
export function parentMagnitudeAt(itemId: string, mark: number): number | null {
  const ladder = markLadderOfItem(itemId)
  return ladder === null ? null : magnitudeOf(ladder, Math.max(BOUGHT_MARK, mark))
}

/**
 * A sensing passive's radius at `mark`, by the Vertical rounding rule of the GD ruling on #203,
 * `reach_n = min(2×base, max(markStepOf(n), reach_{n−1} + 1))`, which sensing's `passiveReach.ts`
 * applies to the same ladder: every Mark adds a tile until the reach first hits its cap.
 */
export function passiveReachAt(itemId: string, mark: number): number | null {
  const ladder = markLadderOfItem(itemId)
  if (ladder?.magnitude === undefined) return null
  const cap = magnitudeOf(ladder, lastMarkOf(ladder)) ?? ladder.magnitude.base
  let reach = ladder.magnitude.base
  for (let next = BOUGHT_MARK + 1; next <= mark; next += 1) {
    reach = Math.min(cap, Math.max(magnitudeOf(ladder, next) ?? reach, reach + 1))
  }
  return reach
}

function magnitudeOf(ladder: MarkLadder, mark: number): number | null {
  return markStepOf(ladder, mark).stats.magnitude ?? null
}
