/**
 * The tier an ore unit is kept at as it reaches the hold (TD ruling on ticket 445, comment
 * 6221725921 section 4, seam A'; ticket 509). Every pickup route (the drill, blasts, the bore
 * pickup, gate pulling, the mineral drain) passes through `collectOreUnit`, which asks here once the
 * unit has room, so a lost unit never reaches the provider. The `ores` slice registers the epic and
 * mythic trip clamp, which keeps its ledger in its own save section; with no provider every unit
 * keeps its own sale tier and the state is untouched.
 *
 * The answer only prices the unit: it never stops a cut, bars a cell or opens or closes a gate.
 */
import type { AuthorityState } from '../authority/authorityState'
import { defineOneProviderRegistry, entriesOf } from './seal'

export interface PickupFind {
  planetIndex: number
  /** The band of the tile the unit was mined from. */
  band: number
  /** The cell's tiers above its band's own ore: its rarity lead, negative for a lower ore moved in. */
  tierAboveBand: number
  /** The tier the unit sells at before the provider is asked (#232: a signature's is one up). */
  saleTier: number
}

export interface PickedUp {
  saleTier: number
  state: AuthorityState
}

export interface OrePickupProvider {
  id: string
  pickupOf(state: AuthorityState, playerId: string, find: PickupFind): PickedUp
}

export const ORE_PICKUP_REGISTRY = defineOneProviderRegistry<OrePickupProvider>('orePickup')

/** The tier the unit is kept and sold at, and the state with the provider's ledger after it. */
export function pickedUpUnitOf(
  state: AuthorityState,
  playerId: string,
  find: PickupFind,
): PickedUp {
  const [provider] = entriesOf(ORE_PICKUP_REGISTRY)
  if (provider === undefined) return { saleTier: find.saleTier, state }
  return provider.pickupOf(state, playerId, find)
}
