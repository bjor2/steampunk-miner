/**
 * The economy trace's rows (ticket 907): one per seed, kitPolicy hand and planet, the shape the
 * lane writes to `balance-report/economy-trace.ndjson` and the report reads. Money crosses as
 * canonical strings (decision #5); time stays in whole ticks.
 */
import { TICKS_PER_SECOND } from '../constants/physics'
import { cmp, div, floor, fromSafeInteger, mul, toCanonical, type Money } from '../systems/money'
import type { EconomyTrace, PlanetEconomy, TripSale } from './economyTrace'
import { askWaitTicks, type UpgradeAsk } from './economyTraceAsks'
import type { TripFold } from './tripFold'

/** The bare bot, or the bot buying and using each planet's kit (#823, #826). */
export type KitHand = 'off' | 'on'

/** One seed's run under one hand: its trace, its trips (ticket 918) and the tick it ended at. */
export interface EconomyTraceRun {
  worldSeed: number
  hand: KitHand
  trace: EconomyTrace
  trips: TripFold
  endTick: number
}

/** The ask a planet opened on arrival: what it wanted, and how long the wallet took to cover it. */
export interface ArrivalAskRow {
  upgradeId: string
  price: string
  waitTicks: number
  isCovered: boolean
}

/** The ore trips whose deepest band mined was one band, or the core trips, and the middle sale. */
export interface BandTripsRow {
  band: number | 'core'
  trips: number
  rescued: number
  medianSale: string
}

export interface EconomyTraceRow {
  worldSeed: number
  hand: KitHand
  planet: number
  ticks: number
  arrivalWallet: string
  income: string
  incomePerMinute: string
  upgradesBought: number
  upgrades: Record<string, number>
  arrivalAsk: ArrivalAskRow
  longestAskWaitTicks: number
  uncoveredAsks: number
  deaths: number
  deathsByCause: Record<string, number>
  tripsByBand: BandTripsRow[]
}

export const TICKS_PER_MINUTE = 60 * TICKS_PER_SECOND

export function economyTraceRowsOf(runs: readonly EconomyTraceRun[]): EconomyTraceRow[] {
  return runs.flatMap((run) =>
    [...run.trace.planets.values()].map((planet) => economyTraceRowOf(run, planet)),
  )
}

function economyTraceRowOf(run: EconomyTraceRun, planet: PlanetEconomy): EconomyTraceRow {
  const ticks = planet.lastTick - planet.arrivalTick
  return {
    worldSeed: run.worldSeed,
    hand: run.hand,
    planet: planet.planet,
    ticks,
    arrivalWallet: toCanonical(planet.arrivalWallet),
    income: toCanonical(planet.income),
    incomePerMinute: toCanonical(perMinuteOf(planet.income, ticks)),
    upgradesBought: sumOf(planet.upgrades),
    upgrades: Object.fromEntries(planet.upgrades),
    arrivalAsk: arrivalAskRowOf(planet.asks[0], planet.lastTick),
    longestAskWaitTicks: Math.max(...planet.asks.map((ask) => askWaitTicks(ask, planet.lastTick))),
    uncoveredAsks: planet.asks.filter((ask) => ask.coveredTick === null).length,
    deaths: sumOf(planet.deaths),
    deathsByCause: Object.fromEntries(planet.deaths),
    tripsByBand: bandTripsRowsOf(planet.trips),
  }
}

/** Whole money per minute over `ticks`; the whole amount when no time passed. */
export function perMinuteOf(amount: Money, ticks: number): Money {
  if (ticks <= 0) return amount
  return floor(div(mul(amount, fromSafeInteger(TICKS_PER_MINUTE)), fromSafeInteger(ticks)))
}

function arrivalAskRowOf(ask: UpgradeAsk, lastTick: number): ArrivalAskRow {
  return {
    upgradeId: ask.upgradeId,
    price: toCanonical(ask.price),
    waitTicks: askWaitTicks(ask, lastTick),
    isCovered: ask.coveredTick !== null,
  }
}

/** The ore trips band by band, then the core trips when there were any. */
function bandTripsRowsOf(trips: readonly TripSale[]): BandTripsRow[] {
  const ore = trips.filter((trip) => !trip.isCoreTrip)
  const core = trips.filter((trip) => trip.isCoreTrip)
  const rows = bandsOf(ore).map((band) => bandTripsRowOf(band, tripsInBand(ore, band)))
  return core.length === 0 ? rows : [...rows, bandTripsRowOf('core', core)]
}

/** The distinct bands the trips mined to, shallowest first. */
export function bandsOf(trips: readonly TripSale[]): number[] {
  return [...new Set(trips.map((trip) => trip.band))].sort((a, b) => a - b)
}

export function tripsInBand(trips: readonly TripSale[], band: number): TripSale[] {
  return trips.filter((trip) => trip.band === band)
}

function bandTripsRowOf(band: number | 'core', trips: readonly TripSale[]): BandTripsRow {
  return {
    band,
    trips: trips.length,
    rescued: trips.filter((trip) => trip.isRescued).length,
    medianSale: toCanonical(medianMoneyOf(trips.map((trip) => trip.value))),
  }
}

/** The lower middle of a list that is never empty. */
export function medianMoneyOf(values: readonly Money[]): Money {
  const sorted = [...values].sort(cmp)
  return sorted[Math.floor((sorted.length - 1) / 2)]
}

function sumOf(counts: ReadonlyMap<string, number>): number {
  return [...counts.values()].reduce((total, count) => total + count, 0)
}
