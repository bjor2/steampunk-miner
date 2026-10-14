/**
 * The resonance whistle as a store item (#262, the GD lock on #245: P15, sound, the lure verb): its
 * `vehicle-item` row, its Mark ladder on the lane's entry node, and its one-off price.
 *
 * It goes in the power-up slots. Its part, the brass whistle on the boiler stack, draws at
 * `hull.stack.side` once owned: that point is named by the tech-tree's gear row alone, as an attach
 * use (TD lock on #265), so the item names none of its own (`attach: null`).
 */
import { bandOrePriceAt } from '../../../systems/economy/bandOreCost'
import type { Money } from '../../../systems/money'
import type { VehicleItem } from '../../../systems/registries/vehicleLoadout'
import { POWER_UP_SLOTS } from '../../power-up-core'
import type { MarkLadder } from '../../tech-tree'
import { AETHERIC_ECONOMY, type WhistleBalance } from './aethericEconomy'

export const WHISTLE_ID = 'power.resonance_whistle'
export const WHISTLE_NAME = 'Resonance whistle'
export const WHISTLE_ICON_ID = 'item-power-resonance-whistle'
/** The lane's entry node (`aethericNodes.ts`): the planet the whistle unlocks and is priced at. */
export const WHISTLE_UNLOCK_PLANET = 15

/** The flavour line: no digits, at most 80 characters, never "rig" (#162 acceptance 1, 2). */
export const WHISTLE_DESCRIPTION =
  'A brass whistle on the boiler stack sings a note that calls enemies away.'

export const WHISTLE_VEHICLE_ITEM: VehicleItem = {
  id: WHISTLE_ID,
  iconId: WHISTLE_ICON_ID,
  slots: POWER_UP_SLOTS,
  attach: null,
}

export function whistleBalance(): WhistleBalance {
  return AETHERIC_ECONOMY.resonanceWhistle
}

/** Cooldown, then the lure's duration, then charges (#162 4.6, the #165 rotation). */
export function whistleMarkLadder(): MarkLadder {
  const balance = whistleBalance()
  return {
    isIncomeItem: false,
    cooldown: balance.cooldownTicks,
    magnitude: { base: balance.durationTicks },
    charges: balance.charges,
  }
}

/** The one-off price (#162 4.1): `k` band-5 ore priced at the unlock planet, the same everywhere. */
export function whistlePrice(): Money {
  return bandOrePriceAt(AETHERIC_ECONOMY.price, WHISTLE_UNLOCK_PLANET, WHISTLE_UNLOCK_PLANET)
}
