/**
 * The new capabilities the Upgrade bay offers the rig now (spec #678, Progression 2; ticket 719),
 * the ones the shop's guidance chip puts first: each Outfitter offer the shared flag
 * (`newCapability.ts`) counts while none is owned. The guns' mount until the guns are on, every
 * researched vehicle item not yet bought, and the slices' bay entries the flag lists (the bore
 * gun's mount). Read wherever the rig is, so the chip shows on the surface before it docks; the
 * wallet aside, as a greyed card is still the target. Pure.
 */
import type { AuthorityState } from '../authority/authorityState'
import { vehicleItemsOnSale } from '../authority/vehicleItemRules'
import { fromCanonical, type Money } from '../money'
import { vehicleItemRefOf } from '../registries/kernelItems'
import { bayEntryRowsOf, type BayEntryRow } from './bayEntryRows'
import { gunRowOf } from './gunRow'
import { isNewCapabilityBuy, isNewCapabilityItem, NONE_OWNED } from './newCapability'

export interface CapabilityOffer {
  /** The Outfitter card's key: `guns`, `item.<id>` or `entry.<id>`. */
  key: string
  name: string
  iconId: string
  price: Money
}

export function newCapabilityOffersOf(state: AuthorityState, playerId: string): CapabilityOffer[] {
  return [
    ...gunMountOffersOf(state, playerId),
    ...vehicleItemOffersOf(state, playerId),
    ...bayEntryOffersOf(state, playerId),
  ]
}

function gunMountOffersOf(state: AuthorityState, playerId: string): CapabilityOffer[] {
  const row = gunRowOf(state, playerId)
  if (row === null || !isNewCapabilityBuy(row.card.item, row.level)) return []
  return [
    { key: 'guns', name: row.label, iconId: row.iconId, price: fromCanonical(row.cost.exact) },
  ]
}

function vehicleItemOffersOf(state: AuthorityState, playerId: string): CapabilityOffer[] {
  return vehicleItemsOnSale(state, playerId)
    .filter(({ item }) => isNewCapabilityItem(vehicleItemRefOf(item.id)))
    .map(({ item, offer }) => ({
      key: `item.${item.id}`,
      name: offer.name,
      iconId: item.iconId,
      price: offer.price,
    }))
}

function bayEntryOffersOf(state: AuthorityState, playerId: string): CapabilityOffer[] {
  return bayEntryRowsOf(state, playerId)
    .filter(isNewCapabilityEntry)
    .map((row) => ({
      key: `entry.${row.entryId}`,
      name: row.label,
      iconId: row.iconId,
      price: fromCanonical(row.cost.exact),
    }))
}

/** A Mastered entry has no buy left. */
function isNewCapabilityEntry(row: BayEntryRow): boolean {
  return row.buy !== null && isNewCapabilityBuy(row.card.item, NONE_OWNED)
}
