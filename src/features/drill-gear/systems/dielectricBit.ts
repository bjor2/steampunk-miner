/**
 * The dielectric bit (GD lock on spec #258 Q6, ticket 292): while it sits in `drill.head` it
 * shields the drill as it cuts. An electrified cell it cuts takes no shock, neither the ticks nor
 * the hull, and the field does not tug the drill mid-cut; the kernel's `hazard:magnetic` asks the
 * `shockShields` seam for both. Outside a cut the hull still pays, which is `grounded_lining`'s job.
 * Pure negation: the bit asks no drill gear and yields nothing, so a shielded cut is the cut the
 * planet would give with no hazard, never better.
 */
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import type { ShockShield } from '../../../systems/registries/shockShields'
import { itemInSlot } from '../../../systems/vehicle/loadoutState'

export const DIELECTRIC_BIT_ID = 'gear.dielectric_bit'

export const DIELECTRIC_BIT_SHIELD: ShockShield = {
  id: 'drill-gear.dielectric-bit',
  isShielding: isDielectricBitMounted,
}

export function isDielectricBitMounted(state: AuthorityState, playerId: string): boolean {
  if (!Object.hasOwn(state.players, playerId)) return false
  return itemInSlot(vehicleOf(state, playerId).loadout, 'drill.head') === DIELECTRIC_BIT_ID
}
