/**
 * The scripted pacing bot (#29, #6 acceptance 7, #16 targets): plays the slice from a start state
 * through authority commands only, with the movement-time model of `botWorld.ts`, until the core
 * of the slice's last planet is completed or the tick budget runs out. Its commands replay to the
 * same digests (`replayRun`), and its log is what the pacing report is derived from.
 *
 * Each dock cycle: travel when the core is done and the fee is paid, choose a trip (the core while
 * it is the goal, the drill digs it fast enough and the casing holds it, else the best ore band
 * the casing grade holds), run it, refine the best of the haul when the platform has the Refinery
 * bay and the bot will dive again (#105), then service and shop. Charges are bought only on a
 * planet where the bot met a tile it would blast with none in stock (#129); travel starts afresh.
 * When no band the casing holds pays a trip, as after a rescue that took the last of the wallet
 * with those bands bored out and the next grade unaffordable (#216), the bot retreats to the
 * shallowest of them, widens its galleries and plays on; broke with a tank too low even for that,
 * it strands itself for the tow that leaves a quarter of the tank (#8).
 */
import { SLICE_LAST_PLANET } from '../../constants/balance'
import { TICKS_PER_SECOND } from '../../constants/physics'
import type { AuthorityCommand, CommandIntent } from '../authority/authorityCommand'
import type { AuthorityState } from '../authority/authorityState'
import { coreNeededOf } from '../authority/coreBay'
import type { DomainEvent } from '../authority/domainEvent'
import { canScratch } from '../vehicle/drillRule'
import { statsOfVehicle } from '../vehicle/vehicleState'
import { coreHardness } from '../economy/oreEconomy'
import { deepestHeldBand, holdsCore } from './botCasing'
import type { ChargePolicy } from './botCharges'
import type { GunPolicy } from './botGuns'
import { collectWhenReady, refineWhenWorthIt, type RefineryUse } from './botRefining'
import { towWhenItRefills } from './botRetreat'
import { buyUpgrades, hasPurchase, serviceAtDock } from './botShopping'
import { createBotSession, type BotListener, type BotSession } from './botSession'
import type { BotPlanet } from './botPilot'
import { driveToUpgradeBay, runTrip } from './botTrip'
import { widenShallowestBand } from './mineLayout'
import { botPlanetOf, travelWhenReady } from './botTravel'
import type { ShopSpend } from './shopSpend'
import type { TripGoal } from './tripGoal'
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
  /** Everything bought at the Upgrade bay, in order: the spend-share diagnostic's input. */
  shopSpend: readonly ShopSpend[]
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
  /** Mount `auto_guns` when offered (the default, #107 bot policy), or never, to compare. */
  gunPolicy?: GunPolicy
  /** Blast hard tiles from planet 7 (the default, #109 bot policy), or never, to compare. */
  chargePolicy?: ChargePolicy
  listener?: BotListener
  /** `used` (the default) from the Refinery bay's planet; `ignored` plays as if it had none. */
  refinery?: RefineryUse
}

/** What every dock cycle of one run needs to know. */
interface BotRun {
  lastPlanet: number
  refinery: RefineryUse
  gunPolicy: GunPolicy
  chargePolicy: ChargePolicy
  /** Appended to at each Upgrade bay visit. */
  shopSpend: ShopSpend[]
}

/**
 * The #6 simulator's floor for a core trip, 0.05 tiles a second: a core tile that takes longer
 * than 20 seconds is not worth the trip.
 */
const CORE_TRIP_MAX_TICKS_PER_TILE = 20 * TICKS_PER_SECOND

/** What playing on from a session under way needs: the run's options past its start. */
export type PlayOnOptions = Omit<SliceRunOptions, 'playerId' | 'startCommands' | 'listener'>

export function playSlice(start: AuthorityState, options: SliceRunOptions): SliceRun {
  const session = createBotSession(start, options.playerId ?? 'p1', options.listener)
  for (const intent of options.startCommands ?? []) session.submit(intent)
  return playSliceFrom(session, botPlanetOf(session, chargePolicyOf(options)), options)
}

/** Plays on from a session under way, the bot on `planet` (a spec's fixture, or `playSlice`). */
export function playSliceFrom(
  session: BotSession,
  planet: BotPlanet,
  options: PlayOnOptions,
): SliceRun {
  const run = botRunOf(options)
  let current = planet
  while (!isLastCoreDone(session, run.lastPlanet) && session.tick() < options.maxTicks) {
    current = travelWhenReady(session, current)
    if (!playDockCycle(session, current, run)) break
  }
  return sliceRunOf(session, run)
}

function botRunOf(options: PlayOnOptions): BotRun {
  return {
    lastPlanet: options.lastPlanet ?? SLICE_LAST_PLANET,
    refinery: options.refinery ?? 'used',
    gunPolicy: options.gunPolicy ?? 'mount',
    chargePolicy: chargePolicyOf(options),
    shopSpend: [],
  }
}

function chargePolicyOf(options: PlayOnOptions): ChargePolicy {
  return options.chargePolicy ?? 'blast'
}

function sliceRunOf(session: BotSession, run: BotRun): SliceRun {
  return {
    commands: session.commands(),
    events: session.events(),
    state: session.state(),
    isFinished: isLastCoreDone(session, run.lastPlanet),
    shopSpend: run.shopSpend,
  }
}

/** Refining pays only when the bot comes back for the batch: not after the run's last core. */
function isRefining(session: BotSession, run: BotRun): boolean {
  return run.refinery === 'used' && !isLastCoreDone(session, run.lastPlanet)
}

function isLastCoreDone(session: BotSession, lastPlanet: number): boolean {
  const state = session.state()
  return state.planet.index >= lastPlanet && state.core.isCompleted
}

/**
 * One trip and the dock after it; with no trip that pays, a tow for a broke bot's empty tank
 * (`botRetreat.ts`, #216), and false when not even that is left.
 */
function playDockCycle(session: BotSession, planet: BotPlanet, run: BotRun): boolean {
  const goal = chooseGoal(session, planet)
  if (goal === null) return towWhenItRefills(session, planet)
  runTrip(session, planet, goal)
  collectWhenReady(session)
  if (isRefining(session, run)) refineWhenWorthIt(session, planet)
  serviceAtDock(session)
  shopAtUpgradeBay(session, planet, run)
  return true
}

/** The bot drives over to the Upgrade bay (#37) only when it has something to buy there. */
function shopAtUpgradeBay(session: BotSession, planet: BotPlanet, run: BotRun): void {
  const isCoreGoal = isCoreTheGoal(session, planet)
  const situation = {
    layout: planet.layout,
    isCoreTheGoal: isCoreGoal,
    gunPolicy: run.gunPolicy,
    hasMetBlastTile: planet.hasMetBlastTile,
  }
  if (!hasPurchase(session, situation)) return
  driveToUpgradeBay(session, planet)
  run.shopSpend.push(...buyUpgrades(session, situation))
}

function chooseGoal(session: BotSession, planet: BotPlanet): TripGoal | null {
  if (isCoreDiggable(session, planet)) return { kind: 'core' }
  return chooseOreGoal(session, planet) ?? chooseRetreatGoal(session, planet)
}

function chooseOreGoal(session: BotSession, planet: BotPlanet): TripGoal | null {
  const means = meansOfVehicle(session.vehicle())
  const plan = bestOrePlan(planet.layout, means, deepestHeldBand(session))
  return plan === null ? null : { kind: 'ore', band: plan.band }
}

/**
 * No held band pays (#216): the shallowest held band with galleries bored out to their reach
 * reaches further, and the bot plans again; null when no held band can widen.
 */
function chooseRetreatGoal(session: BotSession, planet: BotPlanet): TripGoal | null {
  const hasWidened = widenShallowestBand(planet.layout, deepestHeldBand(session))
  return hasWidened ? chooseOreGoal(session, planet) : null
}

/**
 * The core trip comes first whenever it is the goal and the drill makes any headway (the #6
 * simulator's rule); the tank must also reach it today, not just when full, and the casing must
 * hold the core (S11).
 */
function isCoreDiggable(session: BotSession, planet: BotPlanet): boolean {
  const vehicle = session.vehicle()
  return (
    isCoreTheGoal(session, planet) &&
    holdsCore(session) &&
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
