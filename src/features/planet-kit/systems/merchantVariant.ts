/**
 * A planet's merchant variant as its shop reads it (ticket 821, PK2 under spec #647): one merchant
 * system on the #175 dock shops whose variants differ in stock and buy list only (HS point 2 of the
 * GD lock). Identity keys on the stable planet id (s,p), prices on g. The stock is id-keyed and as
 * long as the rows make it (HS: lists grow without limit); each price is shown through the one
 * compact formatter (`formatPrice`, ticket 681), rounded up.
 *
 * The premium is paid once per ore, at its origin's merchant only (`merchantPremium.ts`).
 */
import { formatPrice } from '../../../systems/displayAmount'
import type { Money } from '../../../systems/money'
import type { PlanetId } from '../../solar-systems'
import { kitItemPriceAt } from './planetKitPrices'
import { merchantOfPlanet, premiumTagOf, stockedItemsOf } from './planetKitSales'
import type { KitItem, KitItemKind, MerchantRow, PlanetKits, PremiumOre } from './planetKitTypes'

export interface MerchantStockRow {
  itemId: string
  name: string
  hoverLine: string
  kind: KitItemKind
  /** The carry limit of a consumable; null on a tool. */
  stackLimit: number | null
  price: Money
  /** The #681 readout of the price. */
  priceText: string
}

export interface MerchantVariant {
  planet: PlanetId
  name: string
  /** The species pool the merchant buys: the planet's own ores. */
  buysPool: string
  premiumOre: PremiumOre
  /** "Pays extra for Honey Amber." */
  premiumTag: string
  premiumLiftBp: number
  stock: readonly MerchantStockRow[]
}

/** The merchant variant on `planet`; null where the rows place none. */
export function merchantVariantOf(kits: PlanetKits, planet: PlanetId): MerchantVariant | null {
  const merchant = merchantOfPlanet(kits, planet)
  if (merchant === null) return null
  return {
    planet: merchant.planet,
    name: merchant.name,
    buysPool: merchant.buysPool,
    premiumOre: merchant.premiumOre,
    premiumTag: premiumTagOf(kits, merchant),
    premiumLiftBp: kits.premiumLiftBp,
    stock: merchantStockRowsOf(kits, merchant),
  }
}

function merchantStockRowsOf(kits: PlanetKits, merchant: MerchantRow): MerchantStockRow[] {
  return stockedItemsOf(kits.items, merchant.planet).map((item) =>
    stockRowOf(item, merchant.planet),
  )
}

function stockRowOf(item: KitItem, planet: PlanetId): MerchantStockRow {
  const price = kitItemPriceAt(item, planet)
  return {
    itemId: item.id,
    name: item.name,
    hoverLine: item.hoverLine,
    kind: item.kind,
    stackLimit: item.stackLimit,
    price,
    priceText: formatPrice(price),
  }
}
