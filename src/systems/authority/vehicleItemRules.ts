/**
 * The Upgrade bay's vehicle items (ticket 248, the #157 gap review's X1): `buyVehicleItem
 * {itemId}` buys an item the tech tree unlocked, so the vehicle owns it (`ownsItem`) and the
 * loadout can slot it, a cradle opens its slot and an extractor works.
 *
 * In order it is refused when the item is no registered `vehicle-item` (`unknown_vehicle_item`:
 * a vision row is invisible), the vehicle is not docked at the Upgrade bay, it already owns the
 * item (`vehicle_item_owned`), the item's node is not researched (`not_researched`), no slice sells
 * it on this planet (`not_for_sale`), or the wallet is short. It debits the seller's offer, the
 * price the item's card shows (#162 4.1: `bandOrePriceAt` at the unlock planet), and is answered
 * by `VehicleItemPurchased`. A refused command changes nothing.
 */
import { sub, toCanonical } from '../money'
import { contentOf } from '../registries/content'
import {
  isVehicleItemResearched,
  vehicleItemOfferOf,
  type VehicleItemOffer,
} from '../registries/vehicleItemSales'
import { isVehicleItemId, type VehicleItem } from '../registries/vehicleLoadout'
import { withItemsOwned } from '../vehicle/loadoutState'
import { vehicleOf, withVehicle, withWallet, type AuthorityState } from './authorityState'
import {
  firstRejection,
  rejectionOf,
  type CommandRule,
  type Rejection,
  type RuleEffect,
} from './commandRule'
import { atBayRejection } from './dockRules'
import { ownsItem } from './loadoutRules'
import { moneyShortRejection } from './platformServices'

/** An item the player may buy now, wallet aside: researched, not owned, sold on this planet. */
export interface VehicleItemOnSale {
  item: VehicleItem
  offer: VehicleItemOffer
}

export const VEHICLE_ITEM_RULES: { readonly buyVehicleItem: CommandRule<'buyVehicleItem'> } = {
  buyVehicleItem: {
    fields: { itemId: 'text' },
    reject: (state, { playerId, payload }) =>
      vehicleItemBuyRefusal(state, playerId, payload.itemId),
    apply: (state, { playerId, payload }) => buyVehicleItem(state, playerId, payload.itemId),
  },
}

/** Why buying `itemId` would be refused now, in the order above; null when it would apply. */
export function vehicleItemBuyRefusal(
  state: AuthorityState,
  playerId: string,
  itemId: string,
): Rejection | null {
  return firstRejection([
    () => unknownItemRejection(itemId),
    () => atBayRejection(state, playerId, 'upgrade'),
    () => ownedItemRejection(state, playerId, itemId),
    () => unresearchedItemRejection(state, playerId, itemId),
    () => notForSaleRejection(state, itemId),
    () => moneyShortRejection(state.players[playerId].wallet, offerHereOf(state, itemId).price),
  ])
}

/**
 * The registered items the player could buy on this planet if the wallet allowed, in item id
 * order: what the Upgrade bay lists and the pacing bot picks from.
 */
export function vehicleItemsOnSale(state: AuthorityState, playerId: string): VehicleItemOnSale[] {
  return contentOf('vehicle-item').flatMap((item) => onSaleEntriesOf(state, playerId, item))
}

function onSaleEntriesOf(
  state: AuthorityState,
  playerId: string,
  item: VehicleItem,
): VehicleItemOnSale[] {
  const offer = vehicleItemOfferOf(item.id, state.planet.index)
  return offer !== null && isOpenToBuy(state, playerId, item.id) ? [{ item, offer }] : []
}

function isOpenToBuy(state: AuthorityState, playerId: string, itemId: string): boolean {
  return !ownsItem(state, playerId, itemId) && isVehicleItemResearched(state, playerId, itemId)
}

function buyVehicleItem(state: AuthorityState, playerId: string, itemId: string): RuleEffect {
  const { price } = offerHereOf(state, itemId)
  const owning = withItemOwned(state, playerId, itemId)
  return {
    state: withWallet(owning, playerId, sub(state.players[playerId].wallet, price)),
    events: [{ type: 'VehicleItemPurchased', itemId, price: toCanonical(price) }],
  }
}

function withItemOwned(state: AuthorityState, playerId: string, itemId: string): AuthorityState {
  const vehicle = vehicleOf(state, playerId)
  return withVehicle(state, playerId, {
    ...vehicle,
    loadout: withItemsOwned(vehicle.loadout, [itemId]),
  })
}

/** Only called once `notForSaleRejection` passed, so a seller answers. */
function offerHereOf(state: AuthorityState, itemId: string): VehicleItemOffer {
  return vehicleItemOfferOf(itemId, state.planet.index) as VehicleItemOffer
}

function unknownItemRejection(itemId: string): Rejection | null {
  if (isVehicleItemId(itemId)) return null
  return rejectionOf('unknown_vehicle_item', `${itemId} is not a vehicle item on sale anywhere`)
}

function ownedItemRejection(state: AuthorityState, playerId: string, itemId: string) {
  if (!ownsItem(state, playerId, itemId)) return null
  return rejectionOf('vehicle_item_owned', `the vehicle already owns ${itemId}`)
}

function unresearchedItemRejection(state: AuthorityState, playerId: string, itemId: string) {
  if (isVehicleItemResearched(state, playerId, itemId)) return null
  return rejectionOf('not_researched', `the node that unlocks ${itemId} is not researched`)
}

function notForSaleRejection(state: AuthorityState, itemId: string): Rejection | null {
  if (vehicleItemOfferOf(itemId, state.planet.index) !== null) return null
  return rejectionOf('not_for_sale', `${itemId} is not sold on planet ${state.planet.index}`)
}
