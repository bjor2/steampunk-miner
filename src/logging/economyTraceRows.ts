/**
 * The economy trace's rows (ticket 907): one per seed, kitPolicy hand and planet, the shape the
 * lane writes to `balance-report/economy-trace.ndjson` and the report reads. Money crosses as
 * canonical strings (decision #5); time stays in whole ticks.
 */
import { TICKS_PER_SECOND } from '../constants/physics'
import { cmp, div, floor, fromSafeInteger, mul, toCanonical, type Money } from '../systems/money'
import type { EconomyTrace, PlanetEconomy, TripSale } from './economyTrace'
import { askWaitTicks, type UpgradeAsk } from './economyTraceAsks'

/** The bare bot, or the bot buying and using each planet's kit (#823, #826). */
export type KitHand = 'off' | 'on'

/** One seed's run under one hand: its trace and the tick it ended at. */
export interface EconomyTraceRun {
  worldSeed: number
  hand: KitHand
  trace: EconomyTrace
  endTick: number
}

/** The ask a planet opened on arrival: what it wanted, and how long the wallet took to cover it. */
export interface ArrivalAskRow {
  upgradeId: string
  price: string
  waitTicks: number
  isCovered: boolean
}

/** The trips that reached one band as their deepest, and the middle one's sale. */
export interface BandTripsRow {
  band: number
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

function bandTripsRowsOf(trips: readonly TripSale[]): BandTripsRow[] {
  const bands = [...new Set(trips.map((trip) => trip.band))].sort((a, b) => a - b)
  return bands.map((band) =>
    bandTripsRowOf(
      band,
      trips.filter((trip) => trip.band === band),
    ),
  )
}

function bandTripsRowOf(band: number, trips: readonly TripSale[]): BandTripsRow {
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
