/**
 * The steam shield's break (the GD lock on #256: "the shield's break fires
 * `consumable.smoke_canister` as a small puff at half reach"): on the tick the curtain comes down,
 * the shield's Mark 9 sibling-link fires from where the miner is, through `power-up-core`'s link
 * rules (slotted and ready, the canister's own charge and cooldown, the tile flash, the switch).
 * Before Mark 9, or with the link off or the canister not ready, nothing happens and nothing is
 * logged. The shield's raise never fires it (`linkMoment: 'own'`).
 */
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { unchanged, type RuleEffect } from '../../../systems/authority/commandRule'
import { tileOfPose } from '../../../systems/vehicle/vehiclePose'
import { fireSiblingLinkAt } from '../../power-up-core'
import { MOBILITY_ITEM } from './itemIds'
import { mobilityOf, type MobilityState } from './mobilitySection'

/** At the clock's `tick`: the curtain that ends now fires its link, once, before it is cleared. */
export function breakSteamShield(
  state: AuthorityState,
  playerId: string,
  tick: number,
): RuleEffect {
  const pose = vehicleOf(state, playerId).pose
  if (!isCurtainDownAt(mobilityOf(state, playerId), tick) || pose === null) return unchanged(state)
  return fireSiblingLinkAt(state, {
    playerId,
    itemId: MOBILITY_ITEM.steamShield,
    tick,
    origin: tileOfPose(pose),
  })
}

/** A curtain was raised and its window has run out by `tick`. */
function isCurtainDownAt({ shieldUntilTick }: MobilityState, tick: number): boolean {
  return shieldUntilTick > 0 && tick >= shieldUntilTick
}
