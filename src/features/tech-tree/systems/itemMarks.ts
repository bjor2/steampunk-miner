/**
 * The Mark an item plays at (#249, spec #162 section 4.6): how far the player researched it, and
 * the ladder its capability carries. `power-up-core` steps each use with these, so a researched
 * Mark changes how the item acts, not only its card line.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import type { ItemSnapshotView } from '../../../systems/registries/itemSnapshotView'
import type { MarkLadder } from './techNode'
import { markBearerOfItem, registeredTechTree, type TechTree } from './techTree'
import { TECH_TREE_SECTION } from './techTreeSection'
import { itemsUnlockedBy, unlockedItems } from './unlockRules'

/** The highest Mark the player researched of the item: 1 for its capability, 0 for none of it. */
export function researchedMarkOf(
  state: AuthorityState,
  playerId: string,
  itemId: string,
  tree: TechTree = registeredTechTree(),
): number {
  return unlockedItems(state, playerId, tree).find((unlock) => unlock.itemId === itemId)?.mark ?? 0
}

/**
 * The same Mark read off an item card's snapshot view (K7: a card never holds authority state), so
 * a combo's card can show each parent at the Mark the player plays it at (GD lock on #206,
 * decision 8).
 */
export function researchedMarkInViewOf(
  view: ItemSnapshotView,
  itemId: string,
  tree: TechTree = registeredTechTree(),
): number {
  const { unlocked } = view.section(TECH_TREE_SECTION)
  return itemsUnlockedBy(unlocked, tree).find((unlock) => unlock.itemId === itemId)?.mark ?? 0
}

/** The Mark ladder of the item's capability; null for an item that has no Marks. */
export function markLadderOfItem(
  itemId: string,
  tree: TechTree = registeredTechTree(),
): MarkLadder | null {
  return markBearerOfItem(tree, itemId)?.ladder ?? null
}
