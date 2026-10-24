/**
 * Where a kit item is sold (the GD final lock on ticket 820): a tool debuts at its home merchant
 * and every later merchant stocks it too; a consumable is sold on its home planet only. "Later"
 * is by g, `campaignIndex(s, p)` (#781), so a generated planet past the first system stocks the
 * first system's tools as well. The premium tag is Progression's template filled with the epithet.
 */
import { campaignIndex } from '../../../systems/starMap/campaignIndex'
import type { PlanetId } from '../../solar-systems'
import type { KitItem, KitItemKind, MerchantRow, PlanetKits } from './planetKitTypes'

export const PREMIUM_TAG_SLOT = '<ore>'

export function merchantOfPlanet(kits: PlanetKits, planet: PlanetId): MerchantRow | null {
  return kits.merchants.find((merchant) => isSamePlanet(merchant.planet, planet)) ?? null
}

export function kitItemOf(kits: PlanetKits, id: string): KitItem | null {
  return kits.items.find((item) => item.id === id) ?? null
}

export function kitItemsOfKind(kits: PlanetKits, kind: KitItemKind): KitItem[] {
  return kits.items.filter((item) => item.kind === kind)
}

/** Whether the merchant on `planet` sells `item`: at home for every item, later too for a tool. */
export function isKitItemSoldAt(item: KitItem, planet: PlanetId): boolean {
  if (isSamePlanet(item.homePlanet, planet)) return true
  return (
    item.sale === 'home-and-later' && campaignIndexOf(planet) > campaignIndexOf(item.homePlanet)
  )
}

/** The item ids the merchant on `planet` stocks, in debut order: by home g, then by id. */
export function stockOfMerchant(items: readonly KitItem[], planet: PlanetId): string[] {
  return stockedItemsOf(items, planet).map((item) => item.id)
}

/** The items the merchant on `planet` stocks, in debut order. */
export function stockedItemsOf(items: readonly KitItem[], planet: PlanetId): KitItem[] {
  return items.filter((item) => isKitItemSoldAt(item, planet)).sort(byDebut)
}

/** "Pays extra for Honey Amber.": the merchant's premium tag. */
export function premiumTagOf(kits: PlanetKits, merchant: MerchantRow): string {
  return kits.premiumTag.replace(PREMIUM_TAG_SLOT, merchant.premiumOre.epithet)
}

export function isSamePlanet(a: PlanetId, b: PlanetId): boolean {
  return a.system === b.system && a.planet === b.planet
}

export function campaignIndexOf(planet: PlanetId): bigint {
  return campaignIndex(BigInt(planet.system), BigInt(planet.planet))
}

function byDebut(a: KitItem, b: KitItem): number {
  const ga = campaignIndexOf(a.homePlanet)
  const gb = campaignIndexOf(b.homePlanet)
  if (ga !== gb) return ga < gb ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}
