/**
 * The PK7 identity gate's numbers per planet (ticket 826): each planet's medians over the pacing
 * seeds (#84) with merchants off and on, from the R3 tallies (minutes, felt speed, drill + tip
 * majors, money per minute and its step), the item the planet's merchant calls its own, and the
 * shares the identity trace folds (kit spend over all the money spent, by item or together).
 * `identityPaceBars.ts` judges them; `identityPaceLines.ts` prints them.
 */
import { planetMinutesOf } from '../../logging/drillPace'
import { planetMediansOf } from '../../logging/drillPaceBars'
import { planetRadiusMediansOf, ratioOf } from '../../logging/radiusRebaselineMedians'
import {
  add,
  cmp,
  div,
  floor,
  fromSafeInteger,
  mul,
  toSafeInteger,
  ZERO_MONEY,
  type Money,
} from '../../systems/money'
import { kitSpentOf, type PlanetIdentity } from './identityTrace'
import { IDENTITY_PACE_LAST_PLANET, type IdentityPaceRun } from './identityPaceRuns'
import { PLANET_KITS } from './systems/planetKitRows'
import { campaignIndexOf } from './systems/planetKitSales'

export const IDENTITY_PLANETS = Array.from({ length: IDENTITY_PACE_LAST_PLANET }, (_, at) => at + 1)

const BASIS_POINTS = 10000

/** One number both ways: merchants off and on. */
export interface Paired<T> {
  off: T
  on: T
}

/** One planet's medians both ways, and what merchants on decided there. */
export interface IdentityPlanetRow {
  planet: number
  minutes: Paired<number | null>
  felt: Paired<number | null>
  drillTipMajors: Paired<number | null>
  moneyPerMinute: Paired<Money | null>
  /** Money per minute over the planet before's; null on planet 1 or a core never reached. */
  moneyStep: Paired<number | null>
  /** The item this planet's merchant calls its own: the decision merchants on should make. */
  localItemId: string | null
}

/** Each planet's row from the runs both ways. */
export function identityPlanetRowsOf(
  off: readonly IdentityPaceRun[],
  on: readonly IdentityPaceRun[],
): IdentityPlanetRow[] {
  const halves = { off: halfRowsOf(off), on: halfRowsOf(on) }
  return IDENTITY_PLANETS.map((planet, at) => ({
    planet,
    minutes: { off: halves.off[at].minutes, on: halves.on[at].minutes },
    felt: { off: halves.off[at].felt, on: halves.on[at].felt },
    drillTipMajors: { off: halves.off[at].drillTipMajors, on: halves.on[at].drillTipMajors },
    moneyPerMinute: { off: halves.off[at].moneyPerMinute, on: halves.on[at].moneyPerMinute },
    moneyStep: { off: halves.off[at].moneyStep, on: halves.on[at].moneyStep },
    localItemId: localItemIdOf(planet),
  }))
}

/** The item calling planet `planet` of the first system home; null with none. */
export function localItemIdOf(planet: number): string | null {
  const item = PLANET_KITS.items.find(
    ({ homePlanet }) => campaignIndexOf(homePlanet) === BigInt(planet),
  )
  return item?.id ?? null
}

/** An item's share of the money a run spent over planets 1 to 5, or every kit item's. */
export function offCurveShareBpOf(run: IdentityPaceRun, itemId?: string): number | null {
  const planets = [...run.trace.planets.values()]
  const spent = planets.reduce((total, planet) => add(total, planet.spent), ZERO_MONEY)
  const kit = planets.reduce((total, planet) => add(total, kitSpentOf(planet, itemId)), ZERO_MONEY)
  return shareBpOf(kit, spent)
}

/** `part` over `whole` in whole basis points; null with nothing to share. */
export function shareBpOf(part: Money, whole: Money): number | null {
  if (cmp(whole, ZERO_MONEY) <= 0) return null
  return toSafeInteger(floor(div(mul(part, fromSafeInteger(BASIS_POINTS)), whole)))
}

/** The middle of the known values, the lower middle of an even count; null with none known. */
export function medianOf(values: readonly (number | null)[]): number | null {
  const known = values.filter((value): value is number => value !== null).sort((a, b) => a - b)
  return known.length === 0 ? null : known[Math.floor((known.length - 1) / 2)]
}

/** Each seed's minutes on `planet`; null for a core never reached. */
export function seedMinutesOf(runs: readonly IdentityPaceRun[], planet: number): (number | null)[] {
  return runs.map((run) => {
    const pace = run.drill.planets.get(planet)
    return pace === undefined ? null : planetMinutesOf(pace)
  })
}

/** One half's medians per planet. */
interface HalfRow {
  minutes: number | null
  felt: number | null
  drillTipMajors: number | null
  moneyPerMinute: Money | null
  moneyStep: number | null
}

function halfRowsOf(runs: readonly IdentityPaceRun[]): HalfRow[] {
  const paces = planetMediansOf(runs.map(({ worldSeed, drill }) => ({ worldSeed, tally: drill })))
  const money = planetRadiusMediansOf(runs, IDENTITY_PLANETS)
  return IDENTITY_PLANETS.map((_, at) => ({
    minutes: paces[at].minutes,
    felt: paces[at].averageFelt,
    drillTipMajors: paces[at].drillTipMajors,
    moneyPerMinute: money[at].moneyPerMinute,
    moneyStep: stepOf(money[at].moneyPerMinute, money[at - 1]?.moneyPerMinute ?? null),
  }))
}

function stepOf(after: Money | null, before: Money | null): number | null {
  return after === null || before === null ? null : ratioOf(after, before)
}

/** The premium units a planet's first trip mined, a hold's worth at most; null if never reached. */
export function firstTripUnitsOf(planet: PlanetIdentity | undefined): number | null {
  return planet === undefined ? null : Number(planet.firstTripPremiumUnits)
}

/** Minutes to a tenth, or never. */
export function minutesText(minutes: number | null): string {
  return minutes === null ? 'never' : minutes.toFixed(1)
}
