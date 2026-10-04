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
import type { RunEventName } from './eventNames'
import { LOG_SCHEMA_VERSION, type RunEvent } from './runEvent'

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
  upgradesPurchased: number
  coreFragmentsHarvested: number
  enemiesKilled: number
  vehicleDeaths: number
  damageTaken: string
  debugCommandsApplied: number
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
  const tally = events.reduce(foldEvent, emptyTally(events[0]?.runId ?? ''))
  return summaryOf(tally)
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
  upgradesPurchased: number
  coreFragmentsHarvested: number
  enemiesKilled: number
  vehicleDeaths: number
  damageTaken: Money
  debugCommandsApplied: number
  milestones: RunMilestones
}

function emptyTally(runId: string): Tally {
  return {
    runId,
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
    upgradesPurchased: 0,
    coreFragmentsHarvested: 0,
    enemiesKilled: 0,
    vehicleDeaths: 0,
    damageTaken: ZERO_MONEY,
    debugCommandsApplied: 0,
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
  return tally
}

function foldEnvelope(tally: Tally, event: RunEvent): void {
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
  },
  resource_sold: (tally, { data, tick }) => {
    tally.moneyEarned = add(tally.moneyEarned, fromCanonical(data.value))
    tally.milestones.firstSale ??= tick
  },
  upgrade_purchased: (tally, { data, tick }) => {
    tally.upgradeSpending = add(tally.upgradeSpending, fromCanonical(data.cost))
    tally.upgradesPurchased += 1
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
  },
  rescue_triggered: (tally, { data }) => {
    tally.rescueFees = add(tally.rescueFees, fromCanonical(data.fee))
  },
  mining_interval: (tally, { data }) => {
    tally.tilesDestroyed += data.tilesDestroyed
    for (const collected of data.collected) foldCollected(tally, collected)
  },
  mining_session_ended: (tally, { data }) => {
    tally.maxDepthTiles = Math.max(tally.maxDepthTiles, data.maxDepthTiles)
    tally.damageTaken = add(tally.damageTaken, fromCanonical(data.damageTaken))
  },
  core_tile_harvested: (tally, { data }) => {
    tally.coreFragmentsHarvested += data.fragments
  },
  core_completed: (tally, { tick }) => {
    tally.milestones.firstCoreCompleted ??= tick
  },
  enemy_killed: (tally) => {
    tally.enemiesKilled += 1
  },
  vehicle_destroyed: (tally, { tick }) => {
    tally.vehicleDeaths += 1
    tally.milestones.firstDeath ??= tick
  },
  debug_command_applied: (tally) => {
    tally.debugCommandsApplied += 1
  },
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
    upgradesPurchased: tally.upgradesPurchased,
    coreFragmentsHarvested: tally.coreFragmentsHarvested,
    enemiesKilled: tally.enemiesKilled,
    vehicleDeaths: tally.vehicleDeaths,
    damageTaken: toCanonical(tally.damageTaken),
    debugCommandsApplied: tally.debugCommandsApplied,
    milestones: tally.milestones,
  }
}

function totalSpent(tally: Tally): Money {
  return [
    tally.upgradeSpending,
    tally.repairSpending,
    tally.chargingSpending,
    tally.travelSpending,
    tally.rescueFees,
  ].reduce(add, ZERO_MONEY)
}

/** The text of `summary.json`: the one formatting, so written and derived summaries compare. */
export function formatRunSummary(summary: RunSummary): string {
  return `${JSON.stringify(summary, null, 2)}\n`
}
