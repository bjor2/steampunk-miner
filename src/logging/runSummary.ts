/**
 * `summary.json` of a run, derived by one pure function over its events (decision #11 section 3:
 * derived data stays derived, so the game and the comparison tool produce the same summary).
 * Fields follow design doc section 25 as far as the registered events carry them; times are in
 * ticks with a seconds view, money is canonical strings, and `milestones` holds the ticks the
 * section 26 comparisons need. Wall-clock `timestamp` is never read.
 *
 * Each event name with something to say has one fold step below; adding an event to the summary
 * is one entry, not a branch.
 */
import { TICKS_PER_SECOND } from '../constants/physics'
import { add, fromCanonical, toCanonical, ZERO_MONEY, type Money } from '../systems/money'
import { SAWTOOTH_BAND } from '../systems/vehicle/bandDig'
import type { RunEventName } from './eventNames'
import { bandDigOf, type BandDig, type PlanetLevels } from './bandDigReport'
import {
  addMinedOre,
  copyMinedOrder,
  emptyMinedOrder,
  type MinedOrder,
  type MinedRun,
} from './minedOrder'
import {
  startPurchaseChainFold,
  type PurchaseChain,
  type PurchaseChainFold,
} from './purchaseChains'
import { LOG_SCHEMA_VERSION, type RunEvent } from './runEvent'

/** The band the first #86 probe measured; kept beside the sawtooth band, reported only. */
const FIRST_BAND = 1

export interface RunSummary {
  runId: string
  logSchemaVersion: number
  /** `interrupted` when the log has no `game_ended` (a crash or a closed window). */
  outcome: 'ended' | 'interrupted'
  endReason: string | null
  durationTicks: number
  durationSeconds: number
  eventCount: number
  planetsVisited: number[]
  deepestPlanet: number
  maxDepthTiles: number
  tilesDestroyed: number
  resourceUnitsCollected: number
  resourceValueCollected: string
  moneyEarned: string
  moneySpent: string
  upgradeSpending: string
  repairSpending: string
  chargingSpending: string
  travelSpending: string
  rescueFees: string
  /** Lining bills paid at the Sell bay (`lining_settled.paid`, #76 amendment): part of `moneySpent`. */
  liningSpending: string
  /** First-place lining charged as the rings were laid (`casing_lined.price`). */
  liningCharged: string
  /** Lining bills a sale could not cover (`lining_settled.forgiven`); never spent. */
  liningForgiven: string
  upgradesPurchased: number
  coreFragmentsHarvested: number
  enemiesKilled: number
  vehicleDeaths: number
  damageTaken: string
  debugCommandsApplied: number
  /** Track to its last level: bought in the workshop or set by `debug.setUpgrade`. */
  upgradeLevels: Record<string, number>
  /** Planet index (as a string key) to the tick its core was completed (#10). */
  coreCompletedTicks: Record<string, number>
  /**
   * Planet index (as a string key) to its band-1 drill ticks per metre with the levels it was
   * entered and left with (#81 sawtooth, #86); the planet the run ends on is left with its last.
   */
  firstBandDigTicks: Record<string, BandDig>
  /**
   * The same for band 5, the band the #81 sawtooth is judged on (Game Director on #86): departure
   * at most 0.7x arrival on the median of the pacing seeds.
   */
  sawtoothBandDigTicks: Record<string, BandDig>
  /**
   * Planet index (as a string key) to the track levels it was entered and left with, for the
   * drill and tip leads printed beside the sawtooth (#86); the planet the run ends on has no
   * departure.
   */
  planetLevels: PlanetLevels
  /**
   * The ore of every `resource_collected` line in mined order, run-length encoded as
   * `[oreId, units]` (#122); `resource_collected` is a `detail` event, so a release run has none.
   */
  minedOrder: MinedRun[]
  /** Ore id to the units of it collected (#122). */
  minedUnitsByOre: Record<string, number>
  /** The hold-to-buy chains of the run, in the order they started (ticket 226). */
  purchaseChains: PurchaseChain[]
  milestones: RunMilestones
}

/** Tick of the first time each thing happened, or null if it never did. */
export interface RunMilestones {
  /** Planet index (as a string key) to the tick it was first entered. */
  planetReached: Record<string, number>
  firstSale: number | null
  firstUpgrade: number | null
  firstDeath: number | null
  firstCoreCompleted: number | null
}

export function deriveSummary(events: readonly RunEvent[]): RunSummary {
  const tally = events.reduce(foldEvent, emptyTally())
  return summaryOf(tally)
}

/** The same fold one event at a time, so a live run keeps its totals and none of its events (#117). */
export interface RunSummaryFold {
  add(event: RunEvent): void
  /** The summary so far; a copy that later events leave as it was. */
  summarize(): RunSummary
}

export function startRunSummaryFold(): RunSummaryFold {
  const tally = emptyTally()
  return {
    add: (event) => void foldEvent(tally, event),
    summarize: () => summaryOf(tally),
  }
}

interface Tally {
  runId: string
  endReason: string | null
  lastTick: number
  eventCount: number
  planetsVisited: Set<number>
  deepestPlanet: number
  maxDepthTiles: number
  tilesDestroyed: number
  resourceUnitsCollected: number
  resourceValueCollected: Money
  moneyEarned: Money
  upgradeSpending: Money
  repairSpending: Money
  chargingSpending: Money
  travelSpending: Money
  rescueFees: Money
  liningSpending: Money
  liningCharged: Money
  liningForgiven: Money
  upgradesPurchased: number
  coreFragmentsHarvested: number
  enemiesKilled: number
  vehicleDeaths: number
  damageTaken: Money
  debugCommandsApplied: number
  upgradeLevels: Record<string, number>
  coreCompletedTicks: Record<string, number>
  planetLevels: PlanetLevels
  minedOrder: MinedOrder
  purchaseChains: PurchaseChainFold
  milestones: RunMilestones
}

function emptyTally(): Tally {
  return {
    runId: '',
    endReason: null,
    lastTick: 0,
    eventCount: 0,
    planetsVisited: new Set(),
    deepestPlanet: 0,
    maxDepthTiles: 0,
    tilesDestroyed: 0,
    resourceUnitsCollected: 0,
    resourceValueCollected: ZERO_MONEY,
    moneyEarned: ZERO_MONEY,
    upgradeSpending: ZERO_MONEY,
    repairSpending: ZERO_MONEY,
    chargingSpending: ZERO_MONEY,
    travelSpending: ZERO_MONEY,
    rescueFees: ZERO_MONEY,
    liningSpending: ZERO_MONEY,
    liningCharged: ZERO_MONEY,
    liningForgiven: ZERO_MONEY,
    upgradesPurchased: 0,
    coreFragmentsHarvested: 0,
    enemiesKilled: 0,
    vehicleDeaths: 0,
    damageTaken: ZERO_MONEY,
    debugCommandsApplied: 0,
    upgradeLevels: {},
    coreCompletedTicks: {},
    planetLevels: { arrival: {}, departure: {} },
    minedOrder: emptyMinedOrder(),
    purchaseChains: startPurchaseChainFold(),
    milestones: {
      planetReached: {},
      firstSale: null,
      firstUpgrade: null,
      firstDeath: null,
      firstCoreCompleted: null,
    },
  }
}

function foldEvent(tally: Tally, event: RunEvent): Tally {
  foldEnvelope(tally, event)
  EVENT_FOLDS[event.event]?.(tally, event as never)
  tally.purchaseChains.add(event)
  return tally
}

function foldEnvelope(tally: Tally, event: RunEvent): void {
  if (tally.eventCount === 0) tally.runId = event.runId
  tally.eventCount += 1
  tally.lastTick = Math.max(tally.lastTick, event.tick)
  tally.deepestPlanet = Math.max(tally.deepestPlanet, event.planet)
  tally.maxDepthTiles = Math.max(tally.maxDepthTiles, event.depthTiles)
}

type EventFold<N extends RunEventName> = (tally: Tally, event: RunEvent<N>) => void

const EVENT_FOLDS: { readonly [N in RunEventName]?: EventFold<N> } = {
  game_ended: (tally, { data }) => {
    tally.endReason = data.reason
  },
  planet_entered: (tally, { planet, tick }) => {
    tally.planetsVisited.add(planet)
    tally.milestones.planetReached[String(planet)] ??= tick
    tally.planetLevels.arrival[String(planet)] ??= { ...tally.upgradeLevels }
  },
  resource_sold: (tally, { data, tick }) => {
    tally.moneyEarned = add(tally.moneyEarned, fromCanonical(data.value))
    tally.milestones.firstSale ??= tick
  },
  // A refined batch is paid at the Sell bay (#105), so it is money earned like a sale.
  refine_collected: (tally, { data }) => {
    tally.moneyEarned = add(tally.moneyEarned, fromCanonical(data.value))
  },
  upgrade_purchased: (tally, { data, tick }) => {
    tally.upgradeSpending = add(tally.upgradeSpending, fromCanonical(data.cost))
    tally.upgradesPurchased += 1
    tally.upgradeLevels[data.upgradeId] = data.toLevel
    tally.milestones.firstUpgrade ??= tick
  },
  repair_purchased: (tally, { data }) => {
    tally.repairSpending = add(tally.repairSpending, fromCanonical(data.cost))
  },
  energy_recharged: (tally, { data }) => {
    tally.chargingSpending = add(tally.chargingSpending, fromCanonical(data.cost))
  },
  travel_started: (tally, { data }) => {
    tally.travelSpending = add(tally.travelSpending, fromCanonical(data.cost))
    tally.planetLevels.departure[String(data.fromPlanet)] = { ...tally.upgradeLevels }
  },
  rescue_triggered: (tally, { data }) => {
    tally.rescueFees = add(tally.rescueFees, fromCanonical(data.fee))
  },
  casing_lined: (tally, { data }) => {
    tally.liningCharged = add(tally.liningCharged, fromCanonical(data.price))
  },
  lining_settled: (tally, { data }) => {
    tally.liningSpending = add(tally.liningSpending, fromCanonical(data.paid))
    tally.liningForgiven = add(tally.liningForgiven, fromCanonical(data.forgiven))
  },
  mining_interval: (tally, { data }) => {
    tally.tilesDestroyed += data.tilesDestroyed
    for (const collected of data.collected) foldCollected(tally, collected)
  },
  resource_collected: (tally, { data }) => {
    addMinedOre(tally.minedOrder, data)
  },
  mining_session_ended: (tally, { data }) => {
    tally.maxDepthTiles = Math.max(tally.maxDepthTiles, data.maxDepthTiles)
    tally.damageTaken = add(tally.damageTaken, fromCanonical(data.damageTaken))
  },
  core_tile_harvested: (tally, { data }) => {
    tally.coreFragmentsHarvested += data.fragments
  },
  core_completed: (tally, { planet, tick }) => {
    tally.coreCompletedTicks[String(planet)] ??= tick
    tally.milestones.firstCoreCompleted ??= tick
  },
  enemy_killed: (tally) => {
    tally.enemiesKilled += 1
  },
  vehicle_destroyed: (tally, { tick }) => {
    tally.vehicleDeaths += 1
    tally.milestones.firstDeath ??= tick
  },
  debug_command_applied: (tally, event) => {
    tally.debugCommandsApplied += 1
    foldDebugUpgradeLevel(tally, event.data)
    foldStartLevelsOnArrival(tally, event)
  },
}

/** `debug.setUpgrade` logs its args as given: `{ upgradeId, level }` (#11 section 4). */
function foldDebugUpgradeLevel(tally: Tally, data: { command: string; args: unknown }): void {
  if (data.command !== 'debug.setUpgrade') return
  const { upgradeId, level } = data.args as { upgradeId: unknown; level: unknown }
  if (typeof upgradeId === 'string' && Number.isSafeInteger(level)) {
    tally.upgradeLevels[upgradeId] = level as number
  }
}

/** A scenario's start levels, set on the tick its planet is entered, are what the planet is entered with. */
function foldStartLevelsOnArrival(tally: Tally, { planet, tick }: RunEvent): void {
  if (tally.milestones.planetReached[String(planet)] !== tick) return
  tally.planetLevels.arrival[String(planet)] = { ...tally.upgradeLevels }
}

function foldCollected(tally: Tally, collected: { amount: number; value: string }): void {
  tally.resourceUnitsCollected += collected.amount
  tally.resourceValueCollected = add(tally.resourceValueCollected, fromCanonical(collected.value))
}

function summaryOf(tally: Tally): RunSummary {
  return {
    runId: tally.runId,
    logSchemaVersion: LOG_SCHEMA_VERSION,
    outcome: tally.endReason === null ? 'interrupted' : 'ended',
    endReason: tally.endReason,
    durationTicks: tally.lastTick,
    durationSeconds: tally.lastTick / TICKS_PER_SECOND,
    eventCount: tally.eventCount,
    planetsVisited: [...tally.planetsVisited].sort((a, b) => a - b),
    deepestPlanet: tally.deepestPlanet,
    maxDepthTiles: tally.maxDepthTiles,
    tilesDestroyed: tally.tilesDestroyed,
    resourceUnitsCollected: tally.resourceUnitsCollected,
    resourceValueCollected: toCanonical(tally.resourceValueCollected),
    moneyEarned: toCanonical(tally.moneyEarned),
    moneySpent: toCanonical(totalSpent(tally)),
    upgradeSpending: toCanonical(tally.upgradeSpending),
    repairSpending: toCanonical(tally.repairSpending),
    chargingSpending: toCanonical(tally.chargingSpending),
    travelSpending: toCanonical(tally.travelSpending),
    rescueFees: toCanonical(tally.rescueFees),
    liningSpending: toCanonical(tally.liningSpending),
    liningCharged: toCanonical(tally.liningCharged),
    liningForgiven: toCanonical(tally.liningForgiven),
    upgradesPurchased: tally.upgradesPurchased,
    coreFragmentsHarvested: tally.coreFragmentsHarvested,
    enemiesKilled: tally.enemiesKilled,
    vehicleDeaths: tally.vehicleDeaths,
    damageTaken: toCanonical(tally.damageTaken),
    debugCommandsApplied: tally.debugCommandsApplied,
    upgradeLevels: { ...tally.upgradeLevels },
    coreCompletedTicks: { ...tally.coreCompletedTicks },
    firstBandDigTicks: bandDigOf(tally.planetLevels, tally.upgradeLevels, FIRST_BAND),
    sawtoothBandDigTicks: bandDigOf(tally.planetLevels, tally.upgradeLevels, SAWTOOTH_BAND),
    planetLevels: {
      arrival: { ...tally.planetLevels.arrival },
      departure: { ...tally.planetLevels.departure },
    },
    ...minedOrderFieldsOf(copyMinedOrder(tally.minedOrder)),
    purchaseChains: tally.purchaseChains.chains(),
    milestones: { ...tally.milestones, planetReached: { ...tally.milestones.planetReached } },
  }
}

function minedOrderFieldsOf({ runs, unitsByOre }: MinedOrder) {
  return { minedOrder: runs, minedUnitsByOre: unitsByOre }
}

function totalSpent(tally: Tally): Money {
  return [
    tally.upgradeSpending,
    tally.repairSpending,
    tally.chargingSpending,
    tally.travelSpending,
    tally.rescueFees,
    tally.liningSpending,
  ].reduce(add, ZERO_MONEY)
}

/** The text of `summary.json`: the one formatting, so written and derived summaries compare. */
export function formatRunSummary(summary: RunSummary): string {
  return `${JSON.stringify(summary, null, 2)}\n`
}
