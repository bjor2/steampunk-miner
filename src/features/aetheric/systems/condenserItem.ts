/**
 * The aether condenser as a store item (#263, the GD lock on #245: P29, boiler and aether, the
 * condense verb): its `vehicle-item` row, its Mark ladder on its lane node, and its one-off price.
 * Its Marks step the cooldown and the charges; a use always burns the whole gauge it can, so it
 * has no magnitude.
 *
 * It goes in the power-up slots. Its part, the condenser tank on the flank, draws at `hull.flank`
 * once owned: that point is named by the tech-tree's gear row alone, as an attach use (TD lock on
 * #265), so the item names none of its own (`attach: null`).
 */
import { bandOrePriceAt } from '../../../systems/economy/bandOreCost'
import type { Money } from '../../../systems/money'
import type { VehicleItem } from '../../../systems/registries/vehicleLoadout'
import { POWER_UP_SLOTS } from '../../power-up-core'
import type { MarkLadder } from '../../tech-tree'
import { AETHERIC_ECONOMY, type CondenserBalance } from './aethericEconomy'

export const CONDENSER_ID = 'power.aether_condenser'
export const CONDENSER_NAME = 'Aether condenser'
export const CONDENSER_ICON_ID = 'item-power-aether-condenser'
/** Its lane node (`aethericNodes.ts`): the planet the condenser unlocks and is priced at. */
export const CONDENSER_UNLOCK_PLANET = 29

/** The flavour line: no digits, at most 80 characters, never "rig" (#162 acceptance 1, 2). */
export const CONDENSER_DESCRIPTION =
  "A flank tank condenses the boiler's spare heat back into stored charge."

export const CONDENSER_VEHICLE_ITEM: VehicleItem = {
  id: CONDENSER_ID,
  iconId: CONDENSER_ICON_ID,
  slots: POWER_UP_SLOTS,
  attach: null,
}

export function condenserBalance(): CondenserBalance {
  return AETHERIC_ECONOMY.aetherCondenser
}

/** Cooldown, then charges (#162 4.6, the #165 rotation). */
export function condenserMarkLadder(): MarkLadder {
  const balance = condenserBalance()
  return {
    isIncomeItem: false,
    cooldown: balance.cooldownTicks,
    charges: balance.charges,
  }
}

/** The one-off price (#162 4.1): `k` band-5 ore priced at the unlock planet, the same everywhere. */
export function condenserPrice(): Money {
  return bandOrePriceAt(AETHERIC_ECONOMY.price, CONDENSER_UNLOCK_PLANET, CONDENSER_UNLOCK_PLANET)
}
