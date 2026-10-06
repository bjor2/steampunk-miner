/**
 * Heat, lava and the refractory lining as numbers (spec #113 numbers, Systems & Economy), read from
 * the `heat` block of `economy.json` `archetypes`:
 *   band heat      bandHeat[b] * min(cap, ratio^(p - first))  per second, on the act's planets only
 *   drill heat     drillHeatPerSecond while the drill runs
 *   cooling        idle / refractory corridor / surface or platform, the strongest that applies
 *   throttle       drillPower * lerp(1, throttleFloor, (heat - throttleAt) / (gaugeMax - throttleAt))
 *   heat damage    damageAtMaxPerSecond * hullMax a second at the gauge's max
 *   lava contact   +hazardContact.heat and hazardContact.hullFraction * hullMax
 *   refractory     liningMultiplier times the #76 lining charge; unlocked once for
 *                  liningUnlockCost band ore units at the purchase planet (`bandOre`)
 * Band 6 (the core) heats like band 5, the deepest band the data lists. The standard lining is the
 * type every vehicle starts with and costs the plain #76 charge.
 */
import { cmp, div, fromSafeInteger, mul, sub, ZERO_MONEY, type BigStat, type Money } from '../money'
import { bandOrePrice } from './bandOreCost'
import { compoundRatio } from './curveFamilies'
import { ECONOMY } from './economy'
import type { HazardArchetype } from './economyDefinition'

/** The lining every vehicle has from the start (#41); the archetypes add the others. */
export const STANDARD_LINING_TYPE = 'standard'

/** What the vehicle is doing for the gauge's cooling: the strongest cooling that applies wins. */
export type HeatCooling = 'none' | 'idle' | 'liningCorridor' | 'surface'

const ONE = fromSafeInteger(1)
const HEAT_ARCHETYPE_ID = 'heat'

/** The archetype whose act holds planet `planetIndex`, or null on a planet with no hazard. */
export function hazardArchetypeOn(planetIndex: number): HazardArchetype | null {
  return ECONOMY.archetypes.find((archetype) => isInAct(archetype, planetIndex)) ?? null
}

/** The heat archetype itself (the Fire act). */
export function heatArchetype(): HazardArchetype {
  const heat = ECONOMY.archetypes.find((archetype) => archetype.id === HEAT_ARCHETYPE_ID)
  if (heat === undefined) throw new RangeError('economy.json has no heat archetype')
  return heat
}

export function isHeatPlanet(planetIndex: number): boolean {
  return hazardArchetypeOn(planetIndex)?.id === HEAT_ARCHETYPE_ID
}

/** The band's heat on planet `planetIndex`, the act's vertical tail applied; 0 off the act. */
export function bandHeatPerSecond(planetIndex: number, band: number): BigStat {
  const archetype = hazardArchetypeOn(planetIndex)
  if (archetype === null) return ZERO_MONEY
  return mul(bandEntryOf(archetype.bandHeatPerSecond, band), tailOf(archetype, planetIndex))
}

export function drillHeatPerSecond(planetIndex: number): BigStat {
  return hazardArchetypeOn(planetIndex)?.drillHeatPerSecond ?? ZERO_MONEY
}

/** The gauge points a second `cooling` takes off; 0 for `none` or off the act. */
export function heatCoolingPerSecond(planetIndex: number, cooling: HeatCooling): BigStat {
  const archetype = hazardArchetypeOn(planetIndex)
  if (archetype === null || cooling === 'none') return ZERO_MONEY
  return archetype.coolingPerSecond[cooling]
}

/** The share of drill power left at `heat` gauge points: 1 up to the throttle line. */
export function throttleFactor(archetype: HazardArchetype, heat: BigStat): BigStat {
  const throttleAt = fromSafeInteger(archetype.throttleAt)
  if (cmp(heat, throttleAt) <= 0) return ONE
  const span = fromSafeInteger(archetype.gaugeMax - archetype.throttleAt)
  const share = smallerOf(div(sub(heat, throttleAt), span), ONE)
  return sub(ONE, mul(sub(ONE, archetype.throttleFloor), share))
}

/** Hull lost a second while the gauge is at its max. */
export function heatDamagePerSecond(archetype: HazardArchetype, hullMax: BigStat): BigStat {
  return mul(archetype.damageAtMaxPerSecond, hullMax)
}

/** Hull one touch of a pocket takes. */
export function hazardContactDamage(archetype: HazardArchetype, hullMax: BigStat): BigStat {
  return mul(archetype.hazardContact.hullFraction, hullMax)
}

/** The share of a band's rock that is lava pocket on planet `planetIndex`; 0 off the act. */
export function hazardPocketVolume(planetIndex: number, band: number): BigStat {
  const archetype = hazardArchetypeOn(planetIndex)
  if (archetype === null) return ZERO_MONEY
  return bandEntryOf(archetype.hazardPocketVolume, band)
}

/** Every lining type there is: the standard one, then each archetype's, in data order. */
export function liningTypes(): string[] {
  return [STANDARD_LINING_TYPE, ...ECONOMY.archetypes.map((archetype) => archetype.liningType)]
}

/** The archetype a lining type answers, or null for the standard lining. */
export function archetypeOfLiningType(liningType: string): HazardArchetype | null {
  return ECONOMY.archetypes.find((archetype) => archetype.liningType === liningType) ?? null
}

/** What a metre of this type costs against the #76 charge: 1 for the standard lining. */
export function liningTypePriceMultiplier(liningType: string): BigStat {
  return archetypeOfLiningType(liningType)?.liningMultiplier ?? ONE
}

/** Unlocking a lining type at the Upgrade bay of planet `planetIndex`; the standard one is free. */
export function liningTypeUnlockPrice(liningType: string, planetIndex: number): Money {
  const archetype = archetypeOfLiningType(liningType)
  if (archetype === null) return ZERO_MONEY
  return bandOrePrice(archetype.liningUnlockCost, planetIndex)
}

/** `min(cap, ratio^(p - first))`: the act's later planets run hotter (#113 vertical tail). */
function tailOf(archetype: HazardArchetype, planetIndex: number): BigStat {
  const grown = compoundRatio(archetype.tail.ratio, planetIndex - archetype.planets.first)
  return smallerOf(grown, archetype.tail.cap)
}

function bandEntryOf(entries: readonly BigStat[], band: number): BigStat {
  return entries[Math.min(Math.max(band, 1), entries.length) - 1]
}

function isInAct(archetype: HazardArchetype, planetIndex: number): boolean {
  return planetIndex >= archetype.planets.first && planetIndex <= archetype.planets.last
}

function smallerOf(a: BigStat, b: BigStat): BigStat {
  return cmp(a, b) <= 0 ? a : b
}
