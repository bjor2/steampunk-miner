/**
 * The R3 re-baseline's numbers per planet and per hop (ticket 644), each on the median of the
 * pacing seeds (#84), from the runs' drill pace and radius tallies and each seed's ore census:
 * the money per minute from arrival to the core and its step against the #551 equilibrium, the
 * climb share of a trip, the ore cells on the planet, and for each hop the fee share of the wallet
 * at core harvest and whether the #648 clamp bound (the hop the player could not pay in full).
 */
import { TICKS_PER_SECOND } from '../constants/physics'
import { blockHardness } from '../systems/economy/oreEconomy'
import { travelFee } from '../systems/economy/planetCharges'
import { drillPower } from '../systems/economy/vehicleStats'
import {
  cmp,
  div,
  floor,
  fromSafeInteger,
  mul,
  toSafeInteger,
  ZERO_MONEY,
  type Money,
} from '../systems/money'
import type { DrillPaceTally } from './drillPace'
import type { PlanetRadiusPace, RadiusRebaselineTally, TravelHop } from './radiusRebaseline'

/** One seed's run: both tallies and the ore cells of each planet it was played on. */
export interface RadiusRebaselineRun {
  worldSeed: number
  drill: DrillPaceTally
  radius: RadiusRebaselineTally
  oreCellsByPlanet: ReadonlyMap<number, number>
}

export interface PlanetRadiusMedians {
  planet: number
  /** Money per minute from arrival to the core; null for a core the median seed never reached. */
  moneyPerMinute: Money | null
  /** Sales from arrival to the core. */
  salesToCore: Money | null
  climbShareBp: number | null
  oreCells: number | null
}

export interface HopMedians {
  fromPlanet: number
  /** The charge over the wallet at the core of the planet left, in basis points. */
  feeShareBp: number | null
  /** Seeds whose hop the clamp bound, of the seeds that made it. */
  clampedSeeds: number
  seedsHopped: number
}

const BASIS_POINTS = 10000
const PARTS_PER_MILLION = 1000000
const TICKS_PER_MINUTE = 60 * TICKS_PER_SECOND
/** A share with nothing to share: a charge from an empty wallet. */
const WHOLE_SHARE_BP = BASIS_POINTS

export function planetRadiusMediansOf(
  runs: readonly RadiusRebaselineRun[],
  planets: readonly number[],
): PlanetRadiusMedians[] {
  return planets.map((planet) => {
    const paces = runs.map((run) => run.radius.planets.get(planet) ?? null)
    const rates = runs.map((run) => moneyPerMinuteOf(run, planet))
    return {
      planet,
      moneyPerMinute: medianMoneyOf(rates),
      salesToCore: medianMoneyOf(paces.map(salesToCoreOrNull)),
      climbShareBp: medianOf(paces.map(climbShareBpOrNull)),
      oreCells: medianOf(runs.map((run) => run.oreCellsByPlanet.get(planet) ?? null)),
    }
  })
}

/** Sales over the planet's minutes from arrival to its core; null for a core never reached. */
function moneyPerMinuteOf(run: RadiusRebaselineRun, planet: number): Money | null {
  const pace = run.radius.planets.get(planet)
  if (pace?.coreTick == null || pace.coreTick === pace.arrivalTick) return null
  const minutes = div(
    fromSafeInteger(pace.coreTick - pace.arrivalTick),
    fromSafeInteger(TICKS_PER_MINUTE),
  )
  return div(pace.salesToCore, minutes)
}

function salesToCoreOrNull(pace: PlanetRadiusPace | null): Money | null {
  return pace?.coreTick == null ? null : pace.salesToCore
}

function climbShareBpOrNull(pace: PlanetRadiusPace | null): number | null {
  if (pace === null || pace.tripTicks === 0) return null
  return Math.floor((pace.climbTicks * BASIS_POINTS) / pace.tripTicks)
}

export function hopMediansOf(
  runs: readonly RadiusRebaselineRun[],
  fromPlanets: readonly number[],
): HopMedians[] {
  return fromPlanets.map((fromPlanet) => {
    const hops = runs.flatMap((run) => hopOf(run, fromPlanet))
    return {
      fromPlanet,
      feeShareBp: medianOf(hops.map(({ hop, pace }) => feeShareBpOf(hop, pace))),
      clampedSeeds: hops.filter(({ hop }) => isHopClamped(hop)).length,
      seedsHopped: hops.length,
    }
  })
}

function hopOf(run: RadiusRebaselineRun, fromPlanet: number) {
  const hop = run.radius.hops.find((made) => made.fromPlanet === fromPlanet)
  return hop === undefined ? [] : [{ hop, pace: run.radius.planets.get(fromPlanet) ?? null }]
}

/** The charge over the wallet held at core harvest; a charge from an empty wallet is all of it. */
export function feeShareBpOf(hop: TravelHop, pace: PlanetRadiusPace | null): number {
  const wallet = pace?.walletAtCore ?? ZERO_MONEY
  if (cmp(hop.cost, ZERO_MONEY) === 0) return 0
  if (cmp(wallet, ZERO_MONEY) === 0) return WHOLE_SHARE_BP
  return toSafeInteger(floor(div(mul(hop.cost, fromSafeInteger(BASIS_POINTS)), wallet)))
}

/**
 * Whether the #648 clamp bound: the charge fell below the row fee of the planet left, so the
 * wallet could not pay the full fee and keep the next on-curve drill or tip (`travelCharge.ts`).
 */
export function isHopClamped(hop: TravelHop): boolean {
  return cmp(hop.cost, travelFee(hop.fromPlanet)) < 0
}

/**
 * The money-per-minute step from `before` to `after` the #551 equilibrium holds felt speed flat
 * at: R = H^(ln p* / ln g), the VS's p* = exp(ln g ln R / ln H) solved for R (6254600977), with H
 * the band-1 hardness step and g the drill's gain a purchase.
 */
export function equilibriumRateStepOf(after: number, pStar: number): number {
  return Math.exp((Math.log(pStar) * Math.log(hardnessStepOf(after))) / Math.log(drillGain()))
}

/** p* from a measured money-per-minute step into planet `after` (the VS's closed form). */
export function pStarOfRateStep(after: number, rateStep: number): number {
  return Math.exp((Math.log(drillGain()) * Math.log(rateStep)) / Math.log(hardnessStepOf(after)))
}

/** Band-1 hardness of planet `after` over the planet before it (the VS's H, x1.974). */
export function hardnessStepOf(after: number): number {
  return ratioOf(blockHardness(after, 1), blockHardness(after - 1, 1))
}

/** The drill's gain a purchase, the same from level 2 on (#551 point 2, x1.243). */
export function drillGain(): number {
  return ratioOf(drillPower(3), drillPower(2))
}

/** a / b to a millionth, as a number for the logarithms of the closed form. */
export function ratioOf(a: Money, b: Money): number {
  const millionths = floor(mul(div(a, b), fromSafeInteger(PARTS_PER_MILLION)))
  return toSafeInteger(millionths) / PARTS_PER_MILLION
}

/** The middle value, a null (never reached) sorting after every number. */
function medianOf(values: readonly (number | null)[]): number | null {
  const sorted = [...values].sort((a, b) => (a ?? Infinity) - (b ?? Infinity))
  return sorted[Math.floor(sorted.length / 2)] ?? null
}

function medianMoneyOf(values: readonly (Money | null)[]): Money | null {
  const sorted = [...values].sort(compareMoneyNullLast)
  return sorted[Math.floor(sorted.length / 2)] ?? null
}

function compareMoneyNullLast(a: Money | null, b: Money | null): number {
  if (a === null || b === null) return (a === null ? 1 : 0) - (b === null ? 1 : 0)
  return cmp(a, b)
}
