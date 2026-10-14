/**
 * The sensing fork's two items as the store, the loadout and `power-up-core` take them (GD lock on
 * #255, ticket 269): charged items for the power-up slots, sold at the Upgrade bay as one-offs at
 * the lane's 15 band-5 units on the fork's planet, both at the same price. A use acts on nothing
 * in the authority state (reveal only, the TD lock on #203 Q1) once its branch is the active one;
 * an item still owned from a branch the player switched away from is refused at no cost. Each
 * item's part on the rig is the fork piece the tech tree hangs (ticket 270), so the item claims
 * no attach point of its own.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { bandOrePriceAt } from '../../../systems/economy/bandOreCost'
import type { Money } from '../../../systems/money'
import type { VehicleItemOffer } from '../../../systems/registries/vehicleItemSales'
import type { VehicleItem } from '../../../systems/registries/vehicleLoadout'
import { FORK_TIER } from '../../tech-tree'
import {
  POWER_UP_SLOTS,
  type PowerUp,
  type PowerUpOutcome,
  type PowerUpUse,
} from '../../power-up-core'
import { SENSING_ECONOMY } from './sensingEconomy'
import {
  DIVINER_ROD,
  isBranchActive,
  isSensingForkItem,
  SCOUT_PINGER,
  SENSING_FORK_BALANCE,
  type ForkChargeBalance,
  type SensingForkItemId,
} from './sensingFork'

export const BRANCH_INACTIVE = 'sensing.branch_inactive'

interface ForkItemRow {
  itemId: SensingForkItemId
  name: string
  iconId: string
  balance: ForkChargeBalance
}

const FORK_ITEM_ROWS: readonly ForkItemRow[] = [
  {
    itemId: SCOUT_PINGER,
    name: 'Scout pinger',
    iconId: 'item-power-echo-sounder',
    balance: SENSING_FORK_BALANCE.scout,
  },
  {
    itemId: DIVINER_ROD,
    name: 'Diviner rod',
    iconId: 'item-passive-threat-periscope',
    balance: SENSING_FORK_BALANCE.diviner,
  },
]

export const SENSING_FORK_VEHICLE_ITEMS: readonly VehicleItem[] = FORK_ITEM_ROWS.map((row) => ({
  id: row.itemId,
  iconId: row.iconId,
  slots: POWER_UP_SLOTS,
  attach: null,
}))

export const SENSING_FORK_POWER_UPS: readonly PowerUp[] = FORK_ITEM_ROWS.map(powerUpOf)

/** Both items' one-off price: the lane's band-5 units on the fork's planet. */
export function forkItemPrice(): Money {
  return bandOrePriceAt(SENSING_ECONOMY.price, FORK_TIER, FORK_TIER)
}

/** The Upgrade bay's offer of a fork item; null for any other item. */
export function forkItemOfferOf(itemId: string): VehicleItemOffer | null {
  if (!isSensingForkItem(itemId)) return null
  const row = FORK_ITEM_ROWS.find((candidate) => candidate.itemId === itemId) as ForkItemRow
  return { name: row.name, price: forkItemPrice() }
}

function powerUpOf(row: ForkItemRow): PowerUp {
  return {
    id: `sensing.${row.itemId.slice(row.itemId.indexOf('.') + 1)}`,
    itemId: row.itemId,
    iconId: row.iconId,
    name: row.name,
    channelTicks: 0,
    isToggle: false,
    energyDrawBpPerSecond: 0,
    activate: revealWhileBranchActive,
    powerUpClass: 'charged',
    charges: row.balance.charges,
    cooldownTicks: row.balance.cooldownTicks,
    windupTicks: row.balance.windupTicks,
  }
}

/** The use acts and changes nothing while its branch is active: its line is what draws it. */
function revealWhileBranchActive(state: AuthorityState, use: PowerUpUse): PowerUpOutcome {
  if (!isBranchActive(state, use.playerId, use.itemId)) {
    return { kind: 'refused', reason: BRANCH_INACTIVE }
  }
  return { kind: 'acted', effect: { state, events: [] } }
}
