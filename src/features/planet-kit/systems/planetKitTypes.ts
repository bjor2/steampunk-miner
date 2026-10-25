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
}
