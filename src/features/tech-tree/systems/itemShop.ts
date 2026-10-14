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
 *
 * An item whose offer is bought before the tracks (ticket 296: an extractor on its planet, #142
 * acceptance 7) is due from that planet on: its node and then the item come ahead of the bot's
 * track levels, and the bot saves for them while the wallet is short. Before that planet the bot
 * leaves it be, keeping to its schedule though the store sells it on any planet (#411).
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
import { contentOf } from '../../../systems/registries/content'
import {
  vehicleItemOfferOf,
  type VehicleItemOffer,
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
  duePayloadsOf: (state, playerId) =>
    vehicleItemsOnSale(state, playerId)
      .filter((onSale) => isDueOnSale(state, onSale))
      .sort(compareByPrice)
      .map(payloadOf),
}

/** The unowned items the bot buys before the tracks on this planet, by id (ticket 296). */
export function dueItemIdsOf(state: AuthorityState, playerId: string): Set<string> {
  const due = contentOf('vehicle-item').filter((item) => isItemDue(state, playerId, item.id))
  return new Set(due.map((item) => item.id))
}

/**
 * The bot's research filter: the node's item is one it could buy and does not own, and not one it
 * keeps for a later planet of its schedule.
 */
export function unlocksSomethingToBuy(
  state: AuthorityState,
  playerId: string,
  node: TreeNode,
): boolean {
  const { itemId } = node.unlocks
  if (!isVehicleItemId(itemId) || ownsItem(state, playerId, itemId)) return false
  const offer = vehicleItemOfferOf(itemId)
  return offer !== null && !isKeptForLater(offer, state.planet.index)
}

function isItemDue(state: AuthorityState, playerId: string, itemId: string): boolean {
  if (ownsItem(state, playerId, itemId)) return false
  const offer = vehicleItemOfferOf(itemId)
  return offer !== null && isDueOn(offer, state.planet.index)
}

function isDueOnSale(state: AuthorityState, { offer }: VehicleItemOnSale): boolean {
  return isDueOn(offer, state.planet.index)
}

/** Bought before the tracks, and the bot stands on that offer's planet or past it. */
function isDueOn(offer: VehicleItemOffer, planetIndex: number): boolean {
  return offer.boughtBeforeTracksFrom !== undefined && offer.boughtBeforeTracksFrom <= planetIndex
}

/** An offer the bot buys before the tracks from a planet it has not reached. */
function isKeptForLater(offer: VehicleItemOffer, planetIndex: number): boolean {
  return offer.boughtBeforeTracksFrom !== undefined && offer.boughtBeforeTracksFrom > planetIndex
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
