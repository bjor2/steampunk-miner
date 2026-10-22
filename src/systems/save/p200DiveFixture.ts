/**
 * The exact round-trip's planet-200 dive (ticket 405, the Vertical Scaler's decision 1 on spec
 * #401): a crew of eight on planet 200 with the on-curve levels and a wallet near 1e149 written to
 * all 40 significant digits, enemies frozen, `p1` drilling straight down a column as the live
 * client does: a `drillStep` every tick and a pose report every `POSE_REPORT_INTERVAL_TICKS`.
 *
 * - Eight players' share of the per-cell budget is 4 cells (`cutShare.ts`), under what the stamp
 *   touches, so `p1`'s steps are cut by the swept span (ticket 374): a save between two is mid-span.
 * - The drill sits twenty purchases over the curve. Since drill power grows per purchase (#552) the
 *   on-curve planet-200 drill takes some 850 ticks a band-1 cell; twenty purchases more cut one in
 *   about 11 ticks, a few cells a second, and a fractional number of ticks, so the cursor carries a
 *   sub-tick remainder of dig time (Q = `DRILL_SUBSTEPS_PER_TICK`) and the ground under the stamp
 *   stands part cut between two steps.
 *
 * Only specs use it.
 */
import { DRILL_SUBSTEPS_PER_TICK, POSE_REPORT_INTERVAL_TICKS } from '../../constants/balance'
import type { CommandIntent } from '../authority/authorityCommand'
import { createAuthorityState, vehicleOf, type AuthorityState } from '../authority/authorityState'
import type { DomainEvent } from '../authority/domainEvent'
import { planetParamsOf } from '../authority/planetOfState'
import { continueScriptedSession, FREEZE_ENEMIES, poseAbove } from '../authority/scriptedSession'
import { stateDigest } from '../authority/stateDigest'
import { cutStepMmOf } from '../vehicle/cutSpeed'
import { subStepsPerTile } from '../vehicle/drillRule'
import { bandRockHardnessOf } from '../vehicle/nominalGround'
import { statsOfVehicle } from '../vehicle/vehicleState'
import { paceArrivalOn } from '../bot/paceArrival'
import { onCurveStep } from '../economy/vehicleStats'
import { NO_DRIVE } from '../vehicle/driveSigns'
import { FACING } from '../vehicle/vehiclePose'
import type { PlanetParams } from '../world/planetParams'
import { surfaceRowOfColumn } from '../world/tileGrid'

export const DIVE_PLANET = 200
const DIVE_SEED = 83921
/** About 1e149, every one of its 40 significant digits set. */
export const DIVE_WALLET = '1.234567890123456789012345678901234567891e+149'
export const DIVE_CREW = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'] as const
/**
 * Drill power purchases over planet 200's on-curve drill: a band-1 cell in about 11 ticks, not a
 * whole number of them (`isFractionalTicks`).
 */
const DRILL_PURCHASES_OVER_CURVE = 20
/** A band-1 column east of the pad; the body starts on its surface. */
const DIVE_COLUMN = 20
const ARRIVAL_TICK = 1
/** The first tick the dive steps on. */
export const DIVE_START_TICK = 2

/** One tick's commands for `p1`, in the order the client sends them. */
export interface DiveTick {
  tick: number
  intents: CommandIntent[]
}

/** A run of dive ticks: what each tick answered, its digest, and where the run ended. */
export interface DiveRun {
  events: DomainEvent[][]
  digests: string[]
  state: AuthorityState
}

/** The dive's fixed path: the column's x, where it starts, and how far it moves a tick. */
export interface DivePath {
  x: number
  topY: number
  stepMm: number
}

/** The crew arrived on planet 200, `p1` standing on the column's surface facing down. */
export function arrivedForDive(): AuthorityState {
  const session = continueScriptedSession(
    createAuthorityState({ planetIndex: 1, planetSeed: DIVE_SEED, playerIds: DIVE_CREW }),
  )
  arrivalIntents().forEach((intent) => session.submit(ARRIVAL_TICK, intent))
  return session.state()
}

function arrivalIntents(): CommandIntent[] {
  const drillStep = onCurveStep('drill_power', DIVE_PLANET) + DRILL_PURCHASES_OVER_CURVE
  return [
    ...paceArrivalOn(DIVE_PLANET, DIVE_SEED),
    { type: 'debug.setMoney', payload: { amount: DIVE_WALLET } },
    { type: 'debug.setUpgrade', payload: { upgradeId: 'drill_power', level: drillStep } },
    FREEZE_ENEMIES,
  ]
}

/** The column's path for the drill `state` arrived with: it follows the cut at its own speed. */
export function divePathOf(state: AuthorityState): DivePath {
  const params = paramsOf(state)
  const surfaceRow = surfaceRowOfColumn(DIVE_COLUMN, params.radiusTiles)
  return {
    x: DIVE_COLUMN * 1000 + 500,
    topY: (surfaceRow + 1) * 1000 + 400,
    stepMm: cutStepMmOf(cellSubStepsOf(state, params)),
  }
}

/** The sub-steps one cell of the band `p1` stands in takes the drill it has. */
export function cellSubStepsOf(state: AuthorityState, params = paramsOf(state)): number {
  const vehicle = vehicleOf(state, 'p1')
  const hardness = bandRockHardnessOf(vehicle, params)
  const subSteps = hardness === null ? null : subStepsPerTile(statsOfVehicle(vehicle), hardness)
  if (subSteps === null) throw new Error('the dive drill cannot scratch its column')
  return subSteps
}

/** Whether the cell's time leaves a remainder of a tick, so a cursor can carry part of one. */
export function isFractionalTicks(subSteps: number): boolean {
  return subSteps % DRILL_SUBSTEPS_PER_TICK !== 0
}

/** The ticks `fromTick` to `toTick` of the dive: a report first on every interval, then a step. */
export function diveTicks(path: DivePath, fromTick: number, toTick: number): DiveTick[] {
  const ticks: DiveTick[] = []
  for (let tick = fromTick; tick <= toTick; tick++) ticks.push(diveTickAt(path, tick))
  return ticks
}

/** Plays `ticks` on from `state`, stamping each command after the state's last accepted seq. */
export function playDive(state: AuthorityState, ticks: readonly DiveTick[]): DiveRun {
  const session = continueScriptedSession(state)
  const events: DomainEvent[][] = []
  const digests: string[] = []
  for (const { tick, intents } of ticks) {
    events.push(intents.flatMap((intent) => session.submit(tick, intent)))
    digests.push(stateDigest(session.state()))
  }
  return { events, digests, state: session.state() }
}

function diveTickAt(path: DivePath, tick: number): DiveTick {
  const y = path.topY - path.stepMm * (tick - DIVE_START_TICK)
  const payload = { x: path.x, y, facing: FACING.down, drive: NO_DRIVE }
  const step: CommandIntent = { type: 'drillStep', payload }
  if (tick === DIVE_START_TICK) return { tick, intents: [reportAt(path.x, y, 0), step] }
  if (tick % POSE_REPORT_INTERVAL_TICKS !== 0) return { tick, intents: [step] }
  return { tick, intents: [reportAt(path.x, y, POSE_REPORT_INTERVAL_TICKS), step] }
}

function reportAt(x: number, y: number, drillTicks: number): CommandIntent {
  const { type, payload } = poseAbove({ tx: 0, ty: 0 }, FACING.down, { drillTicks })
  return { type, payload: { ...payload, x, y } }
}

function paramsOf(state: AuthorityState): PlanetParams {
  const params = planetParamsOf(state.planet)
  if (params === null) throw new Error('the dive needs a generated planet')
  return params
}
