/**
 * The scripted pacing bot (#29, #6 acceptance 7, #16 targets): plays the slice from a start state
 * through authority commands only, with the movement-time model of `botWorld.ts`, until the core
 * of the slice's last planet is completed or the tick budget runs out. Its commands replay to the
 * same digests (`replayRun`), and its log is what the pacing report is derived from.
 *
 * Each dock cycle: travel when the core is done and the fee is paid, choose a trip (the core while
 * it is the goal and the drill digs it fast enough, else the best ore band), run it, then service
 * and shop.
 */
import { SLICE_LAST_PLANET } from '../../constants/balance'
import { TICKS_PER_SECOND } from '../../constants/physics'
import type { AuthorityCommand, CommandIntent } from '../authority/authorityCommand'
import type { AuthorityState } from '../authority/authorityState'
import { coreNeededOf } from '../authority/coreBay'
import type { DomainEvent } from '../authority/domainEvent'
import { canTravel } from '../authority/travelRules'
import { dockSiteOfPlanet } from '../authority/planetOfState'
import { canScratch } from '../vehicle/drillRule'
import { bayRestTileOf } from '../world/dockBays'
import { statsOfVehicle } from '../vehicle/vehicleState'
import { coreHardness } from '../economy/oreEconomy'
import { buyUpgrades, hasPurchase, serviceAtDock } from './botShopping'
import { createBotSession, type BotListener, type BotSession } from './botSession'
import type { BotPlanet } from './botPilot'
import { driveToUpgradeBay, runTrip } from './botTrip'
import type { TripGoal } from './tripGoal'
import { paramsOfSession } from './botWorld'
import { newMineLayout } from './mineLayout'
import {
  bestOrePlan,
  canReachCore,
  isCoreDugWithin,
  fullTankMeans,
  meansOfVehicle,
} from './tripEstimate'

export interface SliceRun {
  commands: readonly AuthorityCommand[]
  events: readonly DomainEvent[]
  state: AuthorityState
  /** The last planet's core was completed inside the tick budget. */
  isFinished: boolean
}

export interface SliceRunOptions {
  playerId?: string
  /** Ticks the bot may play before giving up; the slice target is at most 130 minutes. */
  maxTicks: number
  /**
   * The planet whose core ends the run: the slice's last (#2) unless a report plays on (#29
   * Systems & Economy note 2: planets 3 to 40 are reported, never gated).
   */
  lastPlanet?: number
  /** Sent before the first trip, such as a scenario's `debug.*` start commands (#11 section 4). */
  startCommands?: readonly CommandIntent[]
  listener?: BotListener
}

/**
 * The #6 simulator's floor for a core trip, 0.05 tiles a second: a core tile that takes longer
 * than 20 seconds is not worth the trip.
 */
const CORE_TRIP_MAX_TICKS_PER_TILE = 20 * TICKS_PER_SECOND

export function playSlice(start: AuthorityState, options: SliceRunOptions): SliceRun {
  const session = createBotSession(start, options.playerId ?? 'p1', options.listener)
  for (const intent of options.startCommands ?? []) session.submit(intent)
  let planet = botPlanetOf(session)
  const lastPlanet = options.lastPlanet ?? SLICE_LAST_PLANET
  while (!isLastCoreDone(session, lastPlanet) && session.tick() < options.maxTicks) {
    planet = travelWhenReady(session, planet)
    if (!playDockCycle(session, planet)) break
  }
  return {
    commands: session.commands(),
    events: session.events(),
    state: session.state(),
    isFinished: isLastCoreDone(session, lastPlanet),
  }
}

function isLastCoreDone(session: BotSession, lastPlanet: number): boolean {
  const state = session.state()
  return state.planet.index >= lastPlanet && state.core.isCompleted
}

function botPlanetOf(session: BotSession): BotPlanet {
  const site = dockSiteOfPlanet(session.state().planet)
  if (site === null) throw new Error('the bot plays only on a generated planet')
  return {
    layout: newMineLayout(paramsOfSession(session.state()), site),
    pilot: { position: bayRestTileOf(site, 'sell'), facing: 1 },
  }
}

/** Travel (#10) as soon as the platform allows it; the new planet gets a fresh mine. */
function travelWhenReady(session: BotSession, planet: BotPlanet): BotPlanet {
  const state = session.state()
  if (!state.core.isCompleted || !canTravel(state, session.playerId)) return planet
  session.submit({ type: 'travel', payload: { toPlanet: state.planet.index + 1 } })
  return botPlanetOf(session)
}

/** One trip and the dock after it; false when no trip can earn anything. */
function playDockCycle(session: BotSession, planet: BotPlanet): boolean {
  const goal = chooseGoal(session, planet)
  if (goal === null) return false
  runTrip(session, planet, goal)
  serviceAtDock(session)
  shopAtUpgradeBay(session, planet)
  return true
}

/** The bot drives over to the Upgrade bay (#37) only when it has something to buy there. */
function shopAtUpgradeBay(session: BotSession, planet: BotPlanet): void {
  const situation = { layout: planet.layout, isCoreTheGoal: isCoreTheGoal(session, planet) }
  if (!hasPurchase(session, situation)) return
  driveToUpgradeBay(session, planet)
  buyUpgrades(session, situation)
}

function chooseGoal(session: BotSession, planet: BotPlanet): TripGoal | null {
  if (isCoreDiggable(session, planet)) return { kind: 'core' }
  const plan = bestOrePlan(planet.layout, meansOfVehicle(session.vehicle()))
  return plan === null ? null : { kind: 'ore', band: plan.band }
}

/**
 * The core trip comes first whenever it is the goal and the drill makes any headway (the #6
 * simulator's rule); the tank must also reach it today, not just when full.
 */
function isCoreDiggable(session: BotSession, planet: BotPlanet): boolean {
  const vehicle = session.vehicle()
  return (
    isCoreTheGoal(session, planet) &&
    canReachCore(planet.layout, meansOfVehicle(vehicle)) &&
    isCoreDugWithin(vehicle.levels, session.state().planet.index, CORE_TRIP_MAX_TICKS_PER_TILE)
  )
}

/** Fragments still short, the tip scratches core, and a tank reaches the core and back. */
function isCoreTheGoal(session: BotSession, planet: BotPlanet): boolean {
  const state = session.state()
  const { levels } = session.vehicle()
  const isShort = state.platform.coreBay < (coreNeededOf(state.planet) ?? 0)
  const tip = statsOfVehicle(session.vehicle()).drillTip
  return (
    isShort &&
    !state.core.isCompleted &&
    canScratch(tip, coreHardness(state.planet.index)) &&
    canReachCore(planet.layout, fullTankMeans(levels))
  )
}
