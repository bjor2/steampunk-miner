/**
 * What the merchant variants charge (ticket 821, PK2 under spec #647; the Systems rows of the GD
 * lock of 24 Oct). Every price keys on the global g, `campaignIndex(s, p)` (#781, VS row 0): a kit
 * item costs `runValueShare · R(g) · paceScale(g)` (the pace factor on tools only), rounded up to
 * the authority's 0.001 like every price (#20, #681). A tool reads g of its home planet at every
 * merchant, with no away markup; a consumable reads g of the planet it is bought on. R(g) is
 * `runValueOf` (jumpFuel.ts) and paceScale is planetEconomy.ts's, which clamps to its last
 * authored step. What the merchant pays for its premium ore is the sell kernel's
 * (`merchantPremium.ts`, #844).
 */
import { runValueOf } from '../../../systems/economy/jumpFuel'
import { paceScale } from '../../../systems/economy/planetEconomy'
import { ceilMilli, mul, type Money } from '../../../systems/money'
import { planetIndexOfCampaign } from '../../../systems/starMap/campaignIndex'
import type { PlanetId } from '../../solar-systems'
import type { KitPriceRule } from './planetKitEconomy'
import { campaignIndexOf } from './planetKitSales'
import type { KitItem } from './planetKitTypes'

/** g of the planet as the safe-integer planet index the economy formulas read. */
export function planetIndexOfKitPlanet(planet: PlanetId): number {
  return planetIndexOfCampaign(campaignIndexOf(planet))
}

/** `share · R(g) · (paceScale(g) when pace-scaled)`, rounded up to 0.001. */
export function kitPriceAtIndex(rule: KitPriceRule, planetIndex: number): Money {
  const ofRunValue = mul(rule.runValueShare, runValueOf(planetIndex))
  return ceilMilli(rule.paceScaled ? mul(ofRunValue, paceScale(planetIndex)) : ofRunValue)
}

/** What the merchant on `buyer` asks for `item`: a tool at its home g, a consumable at the buyer's. */
export function kitItemPriceAt(item: KitItem, buyer: PlanetId): Money {
  return kitPriceAtIndex(item.price, planetIndexOfKitPlanet(pricedPlanetOf(item, buyer)))
}

function pricedPlanetOf(item: KitItem, buyer: PlanetId): PlanetId {
  return item.price.pricedAt === 'home' ? item.homePlanet : buyer
}
