/**
 * The planet a store item unlocks on, for the slices that price it there (#162 4.1: one-offs,
 * cradles and extractors at their unlock planet, ticket 248): the tier of the earliest authored
 * node that unlocks it in the registered tree; null while no registered node unlocks it.
 */
import { itemUnlockTierOf, registeredTechTree } from './techTree'

export function unlockTierOfItem(itemId: string): number | null {
  return itemUnlockTierOf(registeredTechTree(), itemId)
}
