/**
 * The per-planet drill bars of the GD ruling on #551 (ticket 552, VS 6254600977 and the lanes
 * ruling 6254671302), folded from a bot run's steps: per planet the minutes from arrival to core,
 * the drill power purchases bought, the planet-average felt speed (the band-1 law cut of the drill
 * held, cells/s, weighted by the ticks it was held), the felt speed at the core, the longest gap
 * between two drill purchases, the majors of every track (each drill purchase counts as one) and
 * the tank running dry; per drill purchase `{n, D, price, planet, minute, incomePerHour}`, the
 * run-comparison row, with the sales a second earned at the level it replaced.
 *
 * Felt speed is the law's, `3600 / ceil(3600 H^3 / (D P^2))` on the planet's band-1 rock; the
 * pacing bot's whole-tick clock caps its own dig at 60 cells/s until #559, which is why the lane
 * gates only the bars VS let it gate before then.
 */
import { DRILL_SUBSTEPS_PER_TICK } from '../constants/balance'
import { TICKS_PER_SECOND } from '../constants/physics'
import type { AuthorityState } from '../systems/authority/authorityState'
import type { DomainEvent } from '../systems/authority/domainEvent'
import { blockHardness } from '../systems/economy/oreEconomy'
import { drillPower, vehicleStatsAt, type UpgradeLevels } from '../systems/economy/vehicleStats'
import {
  add,
  cmp,
  div,
  fromCanonical,
  fromSafeInteger,
  mul,
  sub,
  toFixedText,
  ZERO_MONEY,
  type Money,
} from '../systems/money'
import { subStepsPerTile } from '../systems/vehicle/drillRule'

const TICKS_PER_MINUTE = 60 * TICKS_PER_SECOND
const TICKS_PER_HOUR = 60 * TICKS_PER_MINUTE
const LAW_CELLS_PER_SECOND_AT_ONE_SUB_STEP = DRILL_SUBSTEPS_PER_TICK * TICKS_PER_SECOND
const PLACES = 3
const ONE = fromSafeInteger(1)
/** Two gains in a row under it are amber, the trigger for the hold row (#551 VS, ticket 553). */
const AMBER_INCOME_GAIN = fromCanonical('0.05')

/** One planet's pace in one run. */
export interface PlanetDrillPace {
  planet: number
  arrivalTick: number
  coreTick: number | null
  drillPurchases: number
  /** Felt cells/s times ticks held, summed from arrival to core (or the run's end). */
  feltTicks: number
  heldTicks: number
  coreFelt: number | null
  longestGapTicks: number
  majors: number
  tankEmpties: number
}

/** One drill power purchase, the run-comparison row (#551 section 7, acceptance 5). */
export interface DrillPurchaseRow {
  n: number
  d: string
  price: string
  planet: number
  minute: string
  /** Sales a hour at the level this purchase replaced, since the purchase before it. */
  incomePerHour: string
  /** The interval's planet at both ends: its income compares with the next only on one planet. */
  isOnePlanetInterval: boolean
}

export interface DrillPaceTally {
  planets: Map<number, PlanetDrillPace>
  purchases: DrillPurchaseRow[]
  felt: { planet: number; levelsKey: string; cellsPerSecond: number; sinceTick: number } | null
  lastPurchase: { tick: number; planet: number } | null
  earnedSinceLastPurchase: Money
}

export function emptyDrillPaceTally(): DrillPaceTally {
  return {
    planets: new Map(),
    purchases: [],
    felt: null,
    lastPurchase: null,
    earnedSinceLastPurchase: ZERO_MONEY,
  }
}

/** One bot step: the state after it and the events it answered, folded in place. */
export function tallyDrillPaceStep(
  tally: DrillPaceTally,
  state: AuthorityState,
  playerId: string,
  events: readonly DomainEvent[],
): void {
  const planet = planetPaceOf(tally, state.planet.index, state.tick)
  holdFeltUntil(tally, planet, state.tick)
  events.forEach((event) => tallyEvent(tally, planet, state.tick, event))
  retakeFelt(tally, state, playerId)
}

function planetPaceOf(tally: DrillPaceTally, planet: number, tick: number): PlanetDrillPace {
  const known = tally.planets.get(planet)
  if (known !== undefined) return known
  const fresh: PlanetDrillPace = {
    planet,
    arrivalTick: tick,
    coreTick: null,
    drillPurchases: 0,
    feltTicks: 0,
    heldTicks: 0,
    coreFelt: null,
    longestGapTicks: 0,
    majors: 0,
    tankEmpties: 0,
  }
  tally.planets.set(planet, fresh)
  return fresh
}

/** The felt speed held since the last change counts for the ticks up to `tick`, until the core. */
function holdFeltUntil(tally: DrillPaceTally, planet: PlanetDrillPace, tick: number): void {
  const felt = tally.felt
  if (felt === null || felt.planet !== planet.planet || planet.coreTick !== null) return
  const ticks = tick - felt.sinceTick
  planet.feltTicks += felt.cellsPerSecond * ticks
  planet.heldTicks += ticks
  felt.sinceTick = tick
}

function tallyEvent(
  tally: DrillPaceTally,
  planet: PlanetDrillPace,
  tick: number,
  event: DomainEvent,
): void {
  if (event.type === 'ResourceSold') tallySale(tally, event.value)
  if (event.type === 'EnergyDepleted') planet.tankEmpties++
  if (event.type === 'CoreCompleted') completeCore(tally, planet, tick)
  if (event.type === 'UpgradePurchased') tallyPurchase(tally, planet, tick, event)
}

function tallySale(tally: DrillPaceTally, value: string): void {
  tally.earnedSinceLastPurchase = add(tally.earnedSinceLastPurchase, fromCanonical(value))
}

function completeCore(tally: DrillPaceTally, planet: PlanetDrillPace, tick: number): void {
  if (planet.coreTick !== null) return
  planet.coreTick = tick
  planet.coreFelt = tally.felt?.planet === planet.planet ? tally.felt.cellsPerSecond : null
}

type PurchaseEvent = Extract<DomainEvent, { type: 'UpgradePurchased' }>

function tallyPurchase(
  tally: DrillPaceTally,
  planet: PlanetDrillPace,
  tick: number,
  event: PurchaseEvent,
): void {
  if (event.upgradeId !== 'drill_power') {
    if (event.isMajor) planet.majors++
    return
  }
  planet.majors++
  planet.drillPurchases++
  recordDrillPurchase(tally, planet, tick, event)
}

function recordDrillPurchase(
  tally: DrillPaceTally,
  planet: PlanetDrillPace,
  tick: number,
  event: PurchaseEvent,
): void {
  const since = tally.lastPurchase ?? { tick: 0, planet: planet.planet }
  planet.longestGapTicks = Math.max(planet.longestGapTicks, tick - since.tick)
  tally.purchases.push(purchaseRowOf(tally, planet.planet, tick, event, since))
  tally.lastPurchase = { tick, planet: planet.planet }
  tally.earnedSinceLastPurchase = ZERO_MONEY
}

function purchaseRowOf(
  tally: DrillPaceTally,
  planet: number,
  tick: number,
  event: PurchaseEvent,
  since: { tick: number; planet: number },
): DrillPurchaseRow {
  return {
    n: event.toLevel,
    d: toFixedText(drillPower(event.toLevel), PLACES),
    price: event.cost,
    planet,
    minute: toFixedText(div(fromSafeInteger(tick), fromSafeInteger(TICKS_PER_MINUTE)), 1),
    incomePerHour: toFixedText(perHourOf(tally.earnedSinceLastPurchase, tick - since.tick), PLACES),
    isOnePlanetInterval: since.planet === planet,
  }
}

function perHourOf(earned: Money, ticks: number): Money {
  if (ticks <= 0) return ZERO_MONEY
  return div(mul(earned, fromSafeInteger(TICKS_PER_HOUR)), fromSafeInteger(ticks))
}

/** The felt speed of the drill the player holds now, worked out again only when it changed. */
function retakeFelt(tally: DrillPaceTally, state: AuthorityState, playerId: string): void {
  const { levels } = state.players[playerId].vehicle
  const levelsKey = `${levels.drill_power}/${levels.drill_tip}`
  const held = tally.felt
  if (held !== null && held.planet === state.planet.index && held.levelsKey === levelsKey) return
  tally.felt = {
    planet: state.planet.index,
    levelsKey,
    cellsPerSecond: feltCellsPerSecond(levels, state.planet.index),
    sinceTick: state.tick,
  }
}

/** The law's band-1 cut of planet `planet` at these levels, in cells/s; 0 where it skids. */
export function feltCellsPerSecond(levels: UpgradeLevels, planet: number): number {
  const subSteps = subStepsPerTile(vehicleStatsAt(levels), blockHardness(planet, 1))
  return subSteps === null ? 0 : LAW_CELLS_PER_SECOND_AT_ONE_SUB_STEP / subSteps
}

/** Arrival to core in minutes; null for a core never completed. */
export function planetMinutesOf(pace: PlanetDrillPace): number | null {
  return pace.coreTick === null ? null : (pace.coreTick - pace.arrivalTick) / TICKS_PER_MINUTE
}

/** The planet-average felt speed, cells/s; 0 for a planet held no tick. */
export function averageFeltOf(pace: PlanetDrillPace): number {
  return pace.heldTicks === 0 ? 0 : pace.feltTicks / pace.heldTicks
}

export function longestGapMinutesOf(pace: PlanetDrillPace): number {
  return pace.longestGapTicks / TICKS_PER_MINUTE
}

/** The income gain of drill purchase `n`: the sales a hour at its level over the level before. */
export interface IncomeGain {
  n: number
  planet: number
  gain: Money
}

/**
 * The income gain of each drill purchase with a one-planet interval on both sides of it: a planet
 * change multiplies ore value, so an interval across one says nothing of the drill.
 */
export function incomeGainsOf(rows: readonly DrillPurchaseRow[]): IncomeGain[] {
  return rows.slice(1).flatMap((row, index) => {
    const before = rows[index]
    const beforeRate = fromCanonical(before.incomePerHour)
    if (!isComparablePair(before, row) || cmp(beforeRate, ZERO_MONEY) === 0) return []
    const gain = sub(div(fromCanonical(row.incomePerHour), beforeRate), ONE)
    return [{ n: before.n, planet: row.planet, gain }]
  })
}

function isComparablePair(before: DrillPurchaseRow, after: DrillPurchaseRow): boolean {
  return before.isOnePlanetInterval && after.isOnePlanetInterval && before.planet === after.planet
}

/** The purchases whose gain is the second in a row under the amber line (+5%, #551 VS). */
export function amberIncomeGainsOf(gains: readonly IncomeGain[]): IncomeGain[] {
  return gains.filter(
    (gain, index) => index > 0 && isUnderAmber(gain) && isUnderAmber(gains[index - 1]),
  )
}

function isUnderAmber({ gain }: IncomeGain): boolean {
  return cmp(gain, AMBER_INCOME_GAIN) < 0
}
