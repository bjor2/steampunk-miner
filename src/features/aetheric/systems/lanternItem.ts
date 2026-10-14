/**
 * The phase lantern as a store item (#261, the GD locks on #245 and #255: the P16 fork's `phase`
 * branch, aether, the phase verb): its `vehicle-item` row, its Mark ladder on its branch node, and
 * its one-off price. Its Marks step the cooldown and the charges; a phase always crosses one cell
 * in the bit's own ticks, so it has no magnitude.
 *
 * It goes in the power-up slots. Its part, the aether lantern on the nose, draws at `hull.nose`
 * once owned: that point is named by the tech-tree's gear row alone, as an attach use (TD lock on
 * #265), so the item names none of its own (`attach: null`).
 */
import { bandOrePriceAt } from '../../../systems/economy/bandOreCost'
import type { Money } from '../../../systems/money'
import type { VehicleItem } from '../../../systems/registries/vehicleLoadout'
import { POWER_UP_SLOTS } from '../../power-up-core'
import { FORK_TIER, type MarkLadder } from '../../tech-tree'
import { AETHERIC_ECONOMY, type LanternBalance } from './aethericEconomy'

export const LANTERN_ID = 'power.phase_lantern'
export const LANTERN_NAME = 'Phase lantern'
export const LANTERN_ICON_ID = 'item-power-phase-lantern'
/** Its branch node (`aethericFork.ts`): the planet the lantern unlocks and is priced at. */
export const LANTERN_UNLOCK_PLANET: number = FORK_TIER

/** The flavour line: no digits, at most 80 characters, never "rig" (#162 acceptance 1, 2). */
export const LANTERN_DESCRIPTION =
  'An aether lantern on the nose lets the hull slip through one cell of ground.'

export const LANTERN_VEHICLE_ITEM: VehicleItem = {
  id: LANTERN_ID,
  iconId: LANTERN_ICON_ID,
  slots: POWER_UP_SLOTS,
  attach: null,
}

export function lanternBalance(): LanternBalance {
  return AETHERIC_ECONOMY.phaseLantern
}

/** Cooldown, then charges (#162 4.6, the #165 rotation): a phase has no magnitude to step. */
export function lanternMarkLadder(): MarkLadder {
  const balance = lanternBalance()
  return { isIncomeItem: false, cooldown: balance.cooldownTicks, charges: balance.charges }
}

/** The one-off price (#162 4.1): `k` band-5 ore priced at the unlock planet, the same everywhere. */
export function lanternPrice(): Money {
  return bandOrePriceAt(AETHERIC_ECONOMY.price, LANTERN_UNLOCK_PLANET, LANTERN_UNLOCK_PLANET)
}
