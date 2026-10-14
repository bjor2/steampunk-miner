/**
 * Foam's only charge source before the consumable restock (GD ruling on #381, option c, with the
 * HS conditions): consumables are never sold whole (#248), so researching foam's terrain tier-3
 * node is what makes the player its owner, and the item comes with its full stack, the json
 * `charges` (`terrain-tools.economy.json`), as every new power-up does. No seller, drop or preview
 * gives a charge: a player who does not own foam has none, and a spray refuses them
 * (`stabiliserFoam.ts`).
 *
 * The grant is an authority reaction to the player's own `TechNodeUnlocked` for foam's node, so it
 * lands with the research in headless, bot and golden runs alike. The debug tree grant researches
 * without owning, as it does every other item; a debug loadout still owns foam outright.
 */
import {
  vehicleOf,
  withVehicle,
  type AuthorityState,
} from '../../../systems/authority/authorityState'
import { unchanged, type RuleEffect } from '../../../systems/authority/commandRule'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { ownsItem } from '../../../systems/authority/loadoutRules'
import type { AuthorityReaction } from '../../../systems/registries/authorityReactions'
import { withItemsOwned } from '../../../systems/vehicle/loadoutState'
import { chargesLeftOf } from '../../power-up-core'
import { terrainItemNamed } from './itemMagnitude'
import { STABILISER_FOAM_ID } from './stabiliserFoam'
import { foamStockedOf } from './terrainEvents'
import { balanceOf } from './terrainItems'

export const FOAM_RESEARCH_REACTION: AuthorityReaction = {
  id: 'terrain-tools.foam-research',
  react: (_before, after, heard) => stockResearchedFoam(after, heard),
}

/** The player who just researched foam's node owns foam, with its starting stack. */
export function stockResearchedFoam(
  state: AuthorityState,
  heard: readonly DomainEvent[],
): RuleEffect {
  const playerId = foamResearcherIn(heard)
  if (playerId === null || ownsItem(state, playerId, STABILISER_FOAM_ID)) return unchanged(state)
  const stocked = withFoamOwned(state, playerId)
  const charges = foamChargesOf(stocked, playerId)
  return { state: stocked, events: [foamStockedOf({ playerId, charges })] }
}

/** The charges the player has: none without owning foam, whatever the power-up would hold. */
export function foamChargesOf(state: AuthorityState, playerId: string): number {
  if (!ownsItem(state, playerId, STABILISER_FOAM_ID)) return 0
  return chargesLeftOf(state, playerId, STABILISER_FOAM_ID)
}

/** The stack research grants: the json `charges`, fixed until the restock exists. */
export function foamStartingCount(): number {
  return balanceOf(terrainItemNamed(STABILISER_FOAM_ID)).charges
}

function foamResearcherIn(heard: readonly DomainEvent[]): string | null {
  const nodeId = foamNodeId()
  const research = heard.find(
    (event) => event.type === 'tech-tree.TechNodeUnlocked' && event.nodeId === nodeId,
  )
  return research?.playerId ?? null
}

function foamNodeId(): string {
  return terrainItemNamed(STABILISER_FOAM_ID).node.id
}

function withFoamOwned(state: AuthorityState, playerId: string): AuthorityState {
  const vehicle = vehicleOf(state, playerId)
  const loadout = withItemsOwned(vehicle.loadout, [STABILISER_FOAM_ID])
  return withVehicle(state, playerId, { ...vehicle, loadout })
}
