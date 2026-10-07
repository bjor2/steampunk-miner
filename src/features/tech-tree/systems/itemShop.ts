/**
 * The tree's side of the store (ticket 248, the #157 gap review's X1): the kernel's
 * `buyVehicleItem` asks here whether an item's node is researched, and the pacing bot buys what
 * the tree unlocked through the purchase seam, before it researches more (`tech-tree.buy-item`
 * sorts before `tech-tree.research`), each item cheapest first.
 *
 * The Vertical Scaler's filter on the gap review: the bot researches only a node that unlocks
 * something it can buy, a registered item some slice sells here that it does not own yet. Research
 * spend with nothing to buy pulls pace down for a reason no player would hit. No node unlocks a
 * track level, so the "track level" half of that rule has nothing to match yet.
 */
import { ownsItem } from '../../../systems/authority/loadoutRules'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import type { KernelCommandType } from '../../../systems/authority/authorityCommand'
import {
  vehicleItemsOnSale,
  type VehicleItemOnSale,
} from '../../../systems/authority/vehicleItemRules'
import { cmp, ZERO_MONEY, type Money } from '../../../systems/money'
import type { BotPurchase } from '../../../systems/registries/botPurchases'
import {
  vehicleItemOfferOf,
  type VehicleItemResearch,
} from '../../../systems/registries/vehicleItemSales'
import { isVehicleItemId } from '../../../systems/registries/vehicleLoadout'
import type { TreeNode } from './techNode'
import { isItemResearched } from './unlockRules'

interface ItemPayload {
  itemId: string
}

const BUY_VEHICLE_ITEM: KernelCommandType = 'buyVehicleItem'

export const ITEM_RESEARCH: VehicleItemResearch = {
  id: 'tech-tree.item-research',
  isResearched: (state, playerId, itemId) => isItemResearched(state, playerId, itemId),
}

export const ITEM_BOT_PURCHASE: BotPurchase = {
  id: 'tech-tree.buy-item',
  command: BUY_VEHICLE_ITEM,
  payloadsToTry: (state, playerId) =>
    [...vehicleItemsOnSale(state, playerId)].sort(compareByPrice).map(payloadOf),
  estimateCost: (state, playerId, args) => priceOnSale(state, playerId, args as ItemPayload),
  isAvailable: (state, playerId, args) => isOnSale(state, playerId, args as ItemPayload),
  boughtIdOf: (args) => (args as ItemPayload).itemId,
}

/** The bot's research filter: the node's item is one it could buy here and does not own. */
export function unlocksSomethingToBuy(
  state: AuthorityState,
  playerId: string,
  node: TreeNode,
): boolean {
  const { itemId } = node.unlocks
  if (!isVehicleItemId(itemId) || ownsItem(state, playerId, itemId)) return false
  return vehicleItemOfferOf(itemId, state.planet.index) !== null
}

function compareByPrice(a: VehicleItemOnSale, b: VehicleItemOnSale): number {
  return cmp(a.offer.price, b.offer.price) || (a.item.id < b.item.id ? -1 : 1)
}

function payloadOf({ item }: VehicleItemOnSale): ItemPayload {
  return { itemId: item.id }
}

function onSaleOf(state: AuthorityState, playerId: string, { itemId }: ItemPayload) {
  return vehicleItemsOnSale(state, playerId).find(({ item }) => item.id === itemId)
}

function isOnSale(state: AuthorityState, playerId: string, payload: ItemPayload): boolean {
  return onSaleOf(state, playerId, payload) !== undefined
}

function priceOnSale(state: AuthorityState, playerId: string, payload: ItemPayload): Money {
  return onSaleOf(state, playerId, payload)?.offer.price ?? ZERO_MONEY
}
