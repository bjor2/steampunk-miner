/**
 * The P200 money lane's summary log (ticket 340; TD pin on #123, GD): one line per planet, folded
 * from the run's events as they arrive, so a run of any length keeps no event list. Each line has
 * the `drill_power`/`drill_tip` levels the planet was entered and left with, the felt speed of each
 * band as drill ticks per metre at both (tiles are 1 m, #6), the time on the planet and the trip
 * share (time neither docked nor cutting, in basis points), and the largest Money magnitude with
 * its significant digits, beside the largest price and income. Every event is also checked against
 * the schema, so a money field that is not its canonical string (#5) is a listed problem. Derived
 * from the log, never written into it (#11 section 3).
 */
import { TICKS_PER_SECOND } from '../constants/physics'
import { cmp, fromCanonical, sub, toCanonical, ZERO_MONEY, type Money } from '../systems/money'
import { bandDigOf, type BandDig, type LoggedLevels } from './bandDigReport'
import { moneyFieldsOf, type MoneyField } from './moneyFields'
import { formatNdjsonLine } from './ndjson'
import type { RunEvent } from './runEvent'
import { runEventProblems } from './runEventSchema'
import { startRunSummaryFold, type RunSummary } from './runSummary'

const BANDS = [1, 2, 3, 4, 5]
const TICKS_PER_MINUTE = 60 * TICKS_PER_SECOND
const BASIS_POINTS = 10_000
/** The price fields of the registry's spending lines: upgrades, travel, repair, rescue, items. */
const PRICE_FIELDS = new Set(['price', 'cost', 'fee'])
/** Money paid to the player: a sale and a refined batch (#105). */
const INCOME_EVENTS = new Set(['resource_sold', 'refine_collected'])
/** Problems kept as text; the count holds them all. */
const PROBLEMS_KEPT = 20

/** The two drill tracks the lane follows (TD pin on #123). */
export type LaneLevels = Readonly<Record<'drill_power' | 'drill_tip', number>>

export interface PlanetMoneyLine {
  planet: number
  ticksOnPlanet: number
  minutesOnPlanet: string
  levels: { arrival: LaneLevels; departure: LaneLevels }
  /** Bands 1 to 5; null where the tip only skids. */
  digTicksPerMetre: { arrival: (number | null)[]; departure: (number | null)[] }
  dockedTicks: number
  cuttingTicks: number
  tripShareBp: number
  largestMoney: string
  largestMoneyDigits: number
  largestPrice: string
  largestIncome: string
}

export interface MoneyLaneSummary {
  lines: PlanetMoneyLine[]
  largestPrice: string
  largestIncome: string
  largestMoney: string
  problemCount: number
  problems: string[]
}

/** What the run itself says: the first line of the summary log, before the planet lines. */
export interface MoneyLaneRun {
  lane: string
  worldSeed: number
  lastPlanet: number
  isFinished: boolean
  endedOnPlanet: number
  endTick: number
}

export interface MoneyLaneFold {
  add(event: RunEvent): void
  summarize(): MoneyLaneSummary
}

interface PlanetTally {
  planet: number
  arrivalTick: number
  departureTick: number | null
  lastTick: number
  dockedTicks: number
  cuttingTicks: number
  largestMoney: Money
  largestPrice: Money
  largestIncome: Money
}

interface LaneTally {
  planets: Map<number, PlanetTally>
  problemCount: number
  problems: string[]
}

export function startMoneyLaneFold(): MoneyLaneFold {
  const summary = startRunSummaryFold()
  const tally: LaneTally = { planets: new Map(), problemCount: 0, problems: [] }
  return {
    add: (event) => {
      summary.add(event)
      foldLaneEvent(tally, event)
    },
    summarize: () => laneSummaryOf(tally, summary.summarize()),
  }
}

function foldLaneEvent(tally: LaneTally, event: RunEvent): void {
  recordProblems(tally, event)
  const planet = planetTallyOf(tally, event)
  foldPlanetTime(planet, event)
  foldPlanetMoney(planet, event.event, moneyFieldsOf(event))
  markDeparture(tally, event)
}

function recordProblems(tally: LaneTally, event: RunEvent): void {
  const problems = runEventProblems(event)
  tally.problemCount += problems.length
  const room = PROBLEMS_KEPT - tally.problems.length
  tally.problems.push(...problems.slice(0, room).map((problem) => `seq ${event.seq}: ${problem}`))
}

function planetTallyOf(tally: LaneTally, { planet, tick }: RunEvent): PlanetTally {
  const known = tally.planets.get(planet)
  if (known !== undefined) return known
  const opened = emptyPlanetTally(planet, tick)
  tally.planets.set(planet, opened)
  return opened
}

function emptyPlanetTally(planet: number, arrivalTick: number): PlanetTally {
  return {
    planet,
    arrivalTick,
    departureTick: null,
    lastTick: arrivalTick,
    dockedTicks: 0,
    cuttingTicks: 0,
    largestMoney: ZERO_MONEY,
    largestPrice: ZERO_MONEY,
    largestIncome: ZERO_MONEY,
  }
}

function foldPlanetTime(planet: PlanetTally, event: RunEvent): void {
  planet.lastTick = Math.max(planet.lastTick, event.tick)
  if (event.event === 'dock_left') planet.dockedTicks += dockStayOf(event)
  if (event.event === 'drill_damage_dealt') planet.cuttingTicks += cutTicksOf(event)
}

/** `travel_started` names the planet left (`fromPlanet`), as the summary's levels read it. */
function markDeparture(tally: LaneTally, event: RunEvent): void {
  if (event.event !== 'travel_started') return
  const left = tally.planets.get((event as RunEvent<'travel_started'>).data.fromPlanet)
  if (left !== undefined) left.departureTick ??= event.tick
}

function dockStayOf(event: RunEvent): number {
  return (event as RunEvent<'dock_left'>).data.durationTicks
}

function cutTicksOf(event: RunEvent): number {
  return (event as RunEvent<'drill_damage_dealt'>).data.ticks
}

function foldPlanetMoney(planet: PlanetTally, eventName: string, fields: MoneyField[]): void {
  for (const { field, text } of fields) {
    const magnitude = magnitudeOf(fromCanonical(text))
    planet.largestMoney = largerOf(planet.largestMoney, magnitude)
    if (PRICE_FIELDS.has(field)) planet.largestPrice = largerOf(planet.largestPrice, magnitude)
    if (isIncomeField(eventName, field)) {
      planet.largestIncome = largerOf(planet.largestIncome, magnitude)
    }
  }
}

function isIncomeField(eventName: string, field: string): boolean {
  return INCOME_EVENTS.has(eventName) && field === 'value'
}

function magnitudeOf(amount: Money): Money {
  return cmp(amount, ZERO_MONEY) < 0 ? sub(ZERO_MONEY, amount) : amount
}

function largerOf(a: Money, b: Money): Money {
  return cmp(b, a) > 0 ? b : a
}

function laneSummaryOf(tally: LaneTally, summary: RunSummary): MoneyLaneSummary {
  const planets = [...tally.planets.values()].sort((a, b) => a.planet - b.planet)
  const digs = BANDS.map((band) => bandDigOf(summary.planetLevels, summary.upgradeLevels, band))
  return {
    lines: planets.map((planet) => planetLineOf(planet, summary, digs)),
    largestPrice: toCanonical(largestOf(planets.map((planet) => planet.largestPrice))),
    largestIncome: toCanonical(largestOf(planets.map((planet) => planet.largestIncome))),
    largestMoney: toCanonical(largestOf(planets.map((planet) => planet.largestMoney))),
    problemCount: tally.problemCount,
    problems: [...tally.problems],
  }
}

function largestOf(amounts: readonly Money[]): Money {
  return amounts.reduce(largerOf, ZERO_MONEY)
}

function planetLineOf(
  planet: PlanetTally,
  summary: RunSummary,
  digs: readonly Record<string, BandDig>[],
): PlanetMoneyLine {
  const key = String(planet.planet)
  const ticksOnPlanet = (planet.departureTick ?? planet.lastTick) - planet.arrivalTick
  const largestMoney = toCanonical(planet.largestMoney)
  return {
    planet: planet.planet,
    ticksOnPlanet,
    minutesOnPlanet: (ticksOnPlanet / TICKS_PER_MINUTE).toFixed(1),
    levels: {
      arrival: laneLevelsOf(summary.planetLevels.arrival[key] ?? {}),
      departure: laneLevelsOf(summary.planetLevels.departure[key] ?? summary.upgradeLevels),
    },
    digTicksPerMetre: {
      arrival: digs.map((byPlanet) => byPlanet[key]?.arrival ?? null),
      departure: digs.map((byPlanet) => byPlanet[key]?.departure ?? null),
    },
    dockedTicks: planet.dockedTicks,
    cuttingTicks: planet.cuttingTicks,
    tripShareBp: tripShareBpOf(ticksOnPlanet, planet.dockedTicks + planet.cuttingTicks),
    largestMoney,
    largestMoneyDigits: significantDigitsOf(largestMoney),
    largestPrice: toCanonical(planet.largestPrice),
    largestIncome: toCanonical(planet.largestIncome),
  }
}

function laneLevelsOf(levels: LoggedLevels): LaneLevels {
  return { drill_power: levels.drill_power ?? 0, drill_tip: levels.drill_tip ?? 0 }
}

/** The share of the stay spent neither docked nor cutting: travel through open ground. */
function tripShareBpOf(ticksOnPlanet: number, busyTicks: number): number {
  if (ticksOnPlanet <= 0) return 0
  const travelTicks = Math.max(0, ticksOnPlanet - busyTicks)
  return Math.floor((travelTicks * BASIS_POINTS) / ticksOnPlanet)
}

/** `toCanonical` writes minimal digits, so the mantissa's digits are the significant ones. */
function significantDigitsOf(canonical: string): number {
  const [mantissa] = canonical.split('e')
  return mantissa.replace('-', '').replace('.', '').length
}

/** The summary log: the run and its largest amounts on the first line, then one line a planet. */
export function moneyLaneNdjsonOf(run: MoneyLaneRun, summary: MoneyLaneSummary): string {
  const { lines, ...largest } = summary
  return [{ ...run, ...largest }, ...lines].map(formatNdjsonLine).join('')
}
