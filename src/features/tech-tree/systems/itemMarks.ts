/**
 * The Mark an item plays at (#249, spec #162 section 4.6): how far the player researched it, and
 * the ladder its capability carries. `power-up-core` steps each use with these, so a researched
 * Mark changes how the item acts, not only its card line.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import type { MarkLadder } from './techNode'
import { markBearerOfItem, registeredTechTree, type TechTree } from './techTree'
import { unlockedItems } from './unlockRules'

/** The highest Mark the player researched of the item: 1 for its capability, 0 for none of it. */
export function researchedMarkOf(
  state: AuthorityState,
  playerId: string,
  itemId: string,
  tree: TechTree = registeredTechTree(),
): number {
  return unlockedItems(state, playerId, tree).find((unlock) => unlock.itemId === itemId)?.mark ?? 0
}

/** The Mark ladder of the item's capability; null for an item that has no Marks. */
export function markLadderOfItem(
  itemId: string,
  tree: TechTree = registeredTechTree(),
): MarkLadder | null {
  return markBearerOfItem(tree, itemId)?.ladder ?? null
}
