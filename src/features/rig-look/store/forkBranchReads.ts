/**
 * The tech tree's fork choice as the drill types' item tracks read it (ticket 623): the branch a
 * lane's fork has active for the player, null before it chooses or for a lane the tree lacks. It
 * lives outside the slice's index, which the tree imports, so the two slices never import each
 * other's index from it.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { activeForkBranchOf, TECH_LANES, type TechLane } from '../../tech-tree'

export function readActiveForkBranch(
  state: AuthorityState,
  playerId: string,
  lane: string,
): string | null {
  return isTechLane(lane) ? activeForkBranchOf(state, playerId, lane) : null
}

function isTechLane(lane: string): lane is TechLane {
  return (TECH_LANES as readonly string[]).includes(lane)
}
