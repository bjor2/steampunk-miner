/**
 * The tree's `requiresOwned` precondition (the GD lock on #204 Q4 b, ticket 233; #162 acceptance
 * 8): a node opens only once the player owns each thing it names. A name is a vehicle item's
 * catalogue id, owned through the kernel's loadout (`ownsItem`), or a lining's module id
 * (`refractory_lining`, the id the store and the item cards use), owned once its type is
 * unlocked: the heat sink flask waits on refractory lining, and a twist on its base item.
 */
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { ownsItem } from '../../../systems/authority/loadoutRules'
import { liningTypes } from '../../../systems/economy/heatEconomy'
import { isLiningTypeOwned, liningRowIdOf } from '../../../systems/vehicle/liningType'

/** Whether the player owns everything in `ownedIds`; an empty list always is. */
export function ownsEveryRequirement(
  state: AuthorityState,
  playerId: string,
  ownedIds: readonly string[],
): boolean {
  return ownedIds.every((ownedId) => ownsRequirement(state, playerId, ownedId))
}

function ownsRequirement(state: AuthorityState, playerId: string, ownedId: string): boolean {
  const liningType = liningTypeOfModule(ownedId)
  if (liningType === null) return ownsItem(state, playerId, ownedId)
  return isLiningTypeOwned(vehicleOf(state, playerId).lining, liningType)
}

function liningTypeOfModule(moduleId: string): string | null {
  return liningTypes().find((liningType) => liningRowIdOf(liningType) === moduleId) ?? null
}
