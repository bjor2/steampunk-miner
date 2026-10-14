/**
 * Who sells the vehicle items, and whether the tree has opened one to a player (ticket 248, the
 * #157 gap review's X1; prices #162 section 4.1). The item slices answer for their own rows and
 * the kernel never imports one:
 *
 * - **`vehicleItemSellers`**: each slice that sells items names and prices them. One-off items,
 *   cradles and extractors cost their band-5 ore units at the item's price anchor (its unlock
 *   planet) through `bandOrePriceAt`, so the card shows the number the authority debits. An offer
 *   reads no planet (Bjor's price-only ruling on #411): the item is for sale the same on every
 *   planet. A seller answers null for an item it does not sell (a consumable, whose stack is the
 *   restock's).
 * - **`vehicleItemResearch`**, one provider (`tech-tree`): whether the player researched the node
 *   that unlocks the item. With none registered nothing is researched, so nothing is on sale.
 *
 * `buyVehicleItem` (`authority/vehicleItemRules.ts`) reads both, so the Upgrade bay's rows, the
 * pacing bot and the authority agree on what is for sale and at what price.
 */
import type { AuthorityState } from '../authority/authorityState'
import type { Money } from '../money'
import { defineOneProviderRegistry, defineRegistry, entriesOf } from './seal'

export interface VehicleItemOffer {
  /** The item's player-facing name, as its card shows it. */
  name: string
  /** What the authority debits, fixed in the catalogue for a one-off (#162 4.1). */
  price: Money
  /**
   * From this planet on the pacing bot researches and buys it ahead of its track levels, saving
   * for it while the wallet is short (ticket 296: an extractor within 4 trips on its planet, #142
   * acceptance 7). The bot's schedule only, never a lock (#411). Left out, the bot buys it after
   * its tracks, as any slice purchase.
   */
  boughtBeforeTracksFrom?: number
}

export interface VehicleItemSeller {
  id: string
  /** The slice's offer for the item; null when it does not sell it. */
  offerOf(itemId: string): VehicleItemOffer | null
}

export interface VehicleItemResearch {
  id: string
  isResearched(state: AuthorityState, playerId: string, itemId: string): boolean
}

export const VEHICLE_ITEM_SELLER_REGISTRY = defineRegistry<VehicleItemSeller>('vehicleItemSellers')

export const VEHICLE_ITEM_RESEARCH_REGISTRY =
  defineOneProviderRegistry<VehicleItemResearch>('vehicleItemResearch')

/** The first seller's offer, in seller id order; null when no slice sells it. */
export function vehicleItemOfferOf(itemId: string): VehicleItemOffer | null {
  for (const seller of entriesOf(VEHICLE_ITEM_SELLER_REGISTRY)) {
    const offer = seller.offerOf(itemId)
    if (offer !== null) return offer
  }
  return null
}

/** The research provider's answer; false while none is registered. */
export function isVehicleItemResearched(
  state: AuthorityState,
  playerId: string,
  itemId: string,
): boolean {
  const [research] = entriesOf(VEHICLE_ITEM_RESEARCH_REGISTRY)
  return research !== undefined && research.isResearched(state, playerId, itemId)
}
