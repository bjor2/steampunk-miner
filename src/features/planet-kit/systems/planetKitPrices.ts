/**
 * What the merchant variants charge and pay (ticket 821, PK2 under spec #647; the Systems rows of
 * the GD lock of 24 Oct). Every amount keys on the global g, `campaignIndex(s, p)` (#781, VS row 0):
 *
 * - **A kit item** costs `runValueShare · R(g) · paceScale(g)` (the pace factor on tools only),
 *   rounded up to the authority's 0.001 like every price (#20, #681). A tool reads g of its home
 *   planet at every merchant, with no away markup; a consumable reads g of the planet it is bought
 *   on. R(g) is `runValueOf` (jumpFuel.ts) and paceScale is planetEconomy.ts's, which clamps to its
 *   last authored step.
 * - **The premium ore** sells at `V(t) · (1 + lift)`, rounded toward zero as every sale (#20). With
 *   `assay_beacon` held the unit gets `V · max(1 + lift, beaconLift)`, never both lifts (Systems on
 *   the locked kits): the beacon's lift is its band-3 price over V (#46, `assayPricing.ts`).
 */
import { assayedSalePrice } from '../../../systems/economy/assayPricing'
import { runValueOf } from '../../../systems/economy/jumpFuel'
import { oreValue } from '../../../systems/economy/oreEconomy'
import { paceScale } from '../../../systems/economy/planetEconomy'
import {
  add,
  ceilMilli,
  cmp,
  div,
  floorMilli,
  fromSafeInteger,
  mul,
  type Money,
} from '../../../systems/money'
import { planetIndexOfCampaign } from '../../../systems/starMap/campaignIndex'
import type { PlanetId } from '../../solar-systems'
import type { KitPriceRule } from './planetKitEconomy'
import { campaignIndexOf } from './planetKitSales'
import type { KitItem } from './planetKitTypes'

const BASIS_POINTS = fromSafeInteger(10_000)
const WHOLE = fromSafeInteger(1)

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

/** One unit of the premium ore at the merchant: `V(t) · (1 + lift)`, rounded toward zero. */
export function premiumUnitPrice(tier: number, liftBp: number): Money {
  return floorMilli(premiumValueOf(tier, liftBp))
}

/**
 * One unit of the premium ore sold with `assay_beacon` held on planet `planetIndex`: the larger
 * of the premium and the beacon's lift, never both. A tier the beacon does not lift keeps the
 * premium alone.
 */
export function premiumUnitPriceWithBeacon(
  planetIndex: number,
  tier: number,
  liftBp: number,
): Money {
  return largerOf(premiumUnitPrice(tier, liftBp), assayedSalePrice(planetIndex, tier))
}

function pricedPlanetOf(item: KitItem, buyer: PlanetId): PlanetId {
  return item.price.pricedAt === 'home' ? item.homePlanet : buyer
}

function premiumValueOf(tier: number, liftBp: number): Money {
  const lift = add(WHOLE, div(fromSafeInteger(liftBp), BASIS_POINTS))
  return mul(oreValue(tier), lift)
}

function largerOf(a: Money, b: Money): Money {
  return cmp(a, b) >= 0 ? a : b
}
