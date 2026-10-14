/**
 * The galvanic arc coil as a store item (#261, the GD locks on #245 and #255: the P16 fork's `arc`
 * branch, galvanism, the arc verb): its `vehicle-item` row, its Mark ladder on its branch node,
 * and its one-off price.
 *
 * It goes in the power-up slots. Its part, the twin Tesla coils on the roof, draws at
 * `hull.roof.coils` once owned: that point is named by the tech-tree's gear row alone, as an
 * attach use (TD lock on #265), so the item names none of its own (`attach: null`).
 */
import { bandOrePriceAt } from '../../../systems/economy/bandOreCost'
import type { Money } from '../../../systems/money'
import type { VehicleItem } from '../../../systems/registries/vehicleLoadout'
import { POWER_UP_SLOTS } from '../../power-up-core'
import { FORK_TIER, type MarkLadder } from '../../tech-tree'
import { AETHERIC_ECONOMY, type ArcCoilBalance } from './aethericEconomy'

export const ARC_COIL_ID = 'power.arc_coil'
export const ARC_COIL_NAME = 'Galvanic arc coil'
export const ARC_COIL_ICON_ID = 'item-power-arc-coil'
/** Its branch node (`aethericFork.ts`): the planet the coil unlocks and is priced at. */
export const ARC_COIL_UNLOCK_PLANET: number = FORK_TIER

/** The flavour line: no digits, at most 80 characters, never "rig" (#162 acceptance 1, 2). */
export const ARC_COIL_DESCRIPTION =
  'Twin coils on the roof throw a bolt that leaps from one enemy to the next.'

export const ARC_COIL_VEHICLE_ITEM: VehicleItem = {
  id: ARC_COIL_ID,
  iconId: ARC_COIL_ICON_ID,
  slots: POWER_UP_SLOTS,
  attach: null,
}

export function arcCoilBalance(): ArcCoilBalance {
  return AETHERIC_ECONOMY.arcCoil
}

/** Cooldown, then the bolt's reach, then charges (#162 4.6, the #165 rotation). */
export function arcCoilMarkLadder(): MarkLadder {
  const balance = arcCoilBalance()
  return {
    isIncomeItem: false,
    cooldown: balance.cooldownTicks,
    magnitude: { base: balance.rangeTiles },
    charges: balance.charges,
  }
}

/** The one-off price (#162 4.1): `k` band-5 ore priced at the unlock planet, the same everywhere. */
export function arcCoilPrice(): Money {
  return bandOrePriceAt(AETHERIC_ECONOMY.price, ARC_COIL_UNLOCK_PLANET, ARC_COIL_UNLOCK_PLANET)
}
