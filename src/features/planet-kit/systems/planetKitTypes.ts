/**
 * The planet kits as the rows ticket (820, spec #647) types them: one merchant variant per planet
 * on the #175 dock shops, differing in stock and buy list only (HS point 2 of the GD lock), and one
 * signature kit item per planet that changes a behaviour with a trade-off. Identity keys on the
 * stable planet id (s,p); every price keys on g through `KitPriceRule`.
 */
import type { Money } from '../../../systems/money'
import type { HazardEffect } from '../../ores'
import type { PlanetId } from '../../solar-systems'
import type { KitPriceRule } from './planetKitEconomy'
import type { KitItemKind, KitSale, TradeOffCost } from './planetKitRowShape'

export type { KitPriceRule, PricedAt } from './planetKitEconomy'
export type { KitItemKind, KitSale, TradeOffCost } from './planetKitRowShape'

/** The one ore of the planet's own pool the merchant pays the premium on, once per ore. */
export interface PremiumOre {
  /** A `materials.json` species id. */
  speciesId: string
  /** The species' epithet, as the premium tag names it ("Honey Amber"). */
  epithet: string
}

export interface MerchantRow {
  planet: PlanetId
  /** Progression's name, at most three words ("Hearthmoor Assay"). */
  name: string
  /** The variant noun: the name less any place name ("Assay"), what a generated merchant is called by. */
  variant: string
  /** The planet's own species pool: the ores this merchant buys. */
  buysPool: string
  premiumOre: PremiumOre
  /** The kit item ids on sale here, in debut order; `stockOfMerchant` derives the same list. */
  stock: readonly string[]
}

/** What the item changes: the home planet's hazard effect it turns into a choice, and the new behaviour. */
export interface KitEffect {
  /** The #651 hazard kind of the home planet; null on planet 1, which has none. */
  hazard: string | null
  hazardEffect: HazardEffect | null
  /** The behaviour's own id; never one the first system or the SS2-B families already have. */
  behaviour: string
  summary: string
}

export interface KitTradeOff {
  costs: TradeOffCost
  summary: string
}

export interface KitItem {
  /** The stats.json id (`cache_crate`); PK4 (#823) adds the row. */
  id: string
  name: string
  /** Progression's hover line, verbatim. */
  hoverLine: string
  kind: KitItemKind
  homePlanet: PlanetId
  sale: KitSale
  /** The carry limit; null on a tool. */
  stackLimit: number | null
  price: KitPriceRule
  effect: KitEffect
  tradeOff: KitTradeOff
}

export interface PlanetKits {
  /** Progression's premium tag with `<ore>` where the epithet goes. */
  premiumTag: string
  premiumLiftBp: number
  /** Systems' fallback for a tool sold away from home; recorded, applied by nothing. */
  awayMarkup: Money
  /** The item ids no merchant sells yet (the GD's ship rule on #850). */
  heldFromSale: ReadonlySet<string>
  /** Planet 1 first. */
  merchants: readonly MerchantRow[]
  /** In home-planet order. */
  items: readonly KitItem[]
  /** The rows a planet past the first system draws its kit from (ticket 824). */
  familyKits: FamilyKits
}

/**
 * Which ore of a generated planet's pool its merchant pays the premium on: one kind of `rarities`
 * lying in a band up to `reachBand`, picked by seed; the shallowest kind where none does.
 */
export interface PremiumRule {
  id: string
  rarities: readonly string[]
  reachBand: number
}

/** One family's or hazard's kit (ticket 824): the merchant variant, the premium rule, the item or none. */
export interface FamilyKitRow {
  /** A first-system hazard kind or a roster family id. */
  familyId: string
  /** A merchant row's `variant`. */
  merchantVariant: string
  premiumRule: PremiumRule
  /** An authored kit item hooked on this family; null where the family has none (premium only). */
  itemId: string | null
}

/** The kit a drawn planet with no new family gets: a variant by seed, premium only. */
export interface NoFamilyKitRow {
  premiumRule: PremiumRule
  itemId: null
}

export interface FamilyKits {
  rows: readonly FamilyKitRow[]
  noFamily: NoFamilyKitRow
}

/**
 * A planet's kit as composition only (TD final on #824, HS condition 2): who trades there, what it
 * pays the premium on and which item, if any, it debuts. Nothing in it keys on g; prices are read
 * at g by `planetKitPrices.ts`.
 */
export interface PlanetKit {
  planet: PlanetId
  /** Authored rows (#820) win; the generator fills only planets past the first system. */
  source: 'authored' | 'generated'
  merchantName: string
  merchantVariant: string
  /** The planet's hazard or new family the kit is keyed on; null where it has none. */
  familyId: string | null
  premiumOre: PremiumOre
  itemId: string | null
}
