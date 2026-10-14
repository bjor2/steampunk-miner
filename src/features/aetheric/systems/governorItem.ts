/**
 * The chronometric governor as a store item (#263, the GD lock on #245: P24, pressure and
 * clockwork, the slow verb): its `vehicle-item` row, its Mark ladder on its lane node, and its
 * one-off price.
 *
 * It goes in the power-up slots. Its part, the escapement cage at the rear, draws at `hull.tail`
 * once owned: that point is named by the tech-tree's gear row alone, as an attach use (TD lock on
 * #265), so the item names none of its own (`attach: null`).
 */
import { bandOrePriceAt } from '../../../systems/economy/bandOreCost'
import type { Money } from '../../../systems/money'
import type { VehicleItem } from '../../../systems/registries/vehicleLoadout'
import { POWER_UP_SLOTS } from '../../power-up-core'
import type { MarkLadder } from '../../tech-tree'
import { AETHERIC_ECONOMY, type GovernorBalance } from './aethericEconomy'

export const GOVERNOR_ID = 'power.chronometric_governor'
export const GOVERNOR_NAME = 'Chronometric governor'
export const GOVERNOR_ICON_ID = 'item-power-chronometric-governor'
/** Its lane node (`aethericNodes.ts`): the planet the governor unlocks and is priced at. */
export const GOVERNOR_UNLOCK_PLANET = 24

/** The flavour line: no digits, at most 80 characters, never "rig" (#162 acceptance 1, 2). */
export const GOVERNOR_DESCRIPTION =
  'An escapement cage slows the clockwork of every enemy caught near it.'

export const GOVERNOR_VEHICLE_ITEM: VehicleItem = {
  id: GOVERNOR_ID,
  iconId: GOVERNOR_ICON_ID,
  slots: POWER_UP_SLOTS,
  attach: null,
}

export function governorBalance(): GovernorBalance {
  return AETHERIC_ECONOMY.chronometricGovernor
}

/** Cooldown, then the pocket's duration, then charges (#162 4.6, the #165 rotation). */
export function governorMarkLadder(): MarkLadder {
  const balance = governorBalance()
  return {
    isIncomeItem: false,
    cooldown: balance.cooldownTicks,
    magnitude: { base: balance.durationTicks },
    charges: balance.charges,
  }
}

/** The one-off price (#162 4.1): `k` band-5 ore priced at the unlock planet, the same everywhere. */
export function governorPrice(): Money {
  return bandOrePriceAt(AETHERIC_ECONOMY.price, GOVERNOR_UNLOCK_PLANET, GOVERNOR_UNLOCK_PLANET)
}
