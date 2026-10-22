/**
 * Rigs by cut speed on planet 1 (ticket 439, the TD shape on #397): each rig is named by the speed
 * the drill law cuts band-1 rock at, 3600 / n m/s at n sub-steps a cell, its drill found by
 * `subStepsPerTile` rather than stored, and cut a tick at a time down a leg of real ground, its
 * body keeping pace with the cut as the live body does. Only specs use them.
 *
 * Planet radii run 300 to just under 1000 tiles, so a 3 s leg fits only rigs up to about 300 m/s;
 * a leg here is a tick count that ends where the body nears the planet's centre (3600 m/s crosses
 * planet 1 in about 5 ticks).
 */
import { DRILL_SUBSTEPS_PER_TICK, STEP_BOUND_TOLERANCE_MM } from '../../constants/balance'
import {
  MM_PER_METRE,
  TICKS_PER_SECOND,
  UP_VECTOR_SCALE,
  VEHICLE_COLLIDER_SIZE,
} from '../../constants/physics'
import { blockHardness } from '../economy/oreEconomy'
import { startLevels, vehicleStatsAt } from '../economy/vehicleStats'
import { NO_DRIVE } from '../vehicle/driveSigns'
import { div, fromSafeInteger, mul, type BigStat } from '../money'
import { drillWorkPerTick, subStepsPerTile, tileWorkToBreak } from '../vehicle/drillRule'
import { drillQuantumOnPlanet } from '../vehicle/drillQuantum'
import { quantumOfCursor, type SweptCut } from '../vehicle/sweptCut'
import { FACING, facingVectorOf, noseTileOf, type VehiclePose } from '../vehicle/vehiclePose'
import { groundReaderOf, type GroundReader } from '../world/groundReader'
import { ISO_DENSITY } from '../world/sampleGrid'
import type { StampPoint } from '../world/stampShape'
import { surfaceRowOfColumn } from '../world/tileGrid'
import { applyCommand } from './applyCommand'
import { vehicleOf, type AuthorityState } from './authorityState'
import type { CommandIntent } from './authorityCommand'
import type { RuleEffect } from './commandRule'
import type { DomainEventBody } from './domainEvent'
import { createScriptedSession, FREEZE_ENEMIES, PARAMS, poseAbove } from './scriptedSession'
import { stepBoundsAt } from './stepBoundRead'
import type { SweepCut } from './sweptSpanFixtures'

/** A rig by the speed it cuts band-1 rock at, m/s, and its drill time a band-1 cell, sub-steps. */
export interface SpeedRig {
  speed: number
  subSteps: number
}

/** The TD's rigs (3600 / n m/s), with the VS ruling's 240 m/s one. */
export const SPEED_RIGS: readonly SpeedRig[] = [
  { speed: 25, subSteps: 144 },
  { speed: 44, subSteps: 82 },
  { speed: 78, subSteps: 46 },
  { speed: 240, subSteps: 15 },
  { speed: 300, subSteps: 12 },
  { speed: 3600, subSteps: 1 },
]

export function rigAt(speed: number): SpeedRig {
  const rig = SPEED_RIGS.find((candidate) => candidate.speed === speed)
  if (rig === undefined) throw new Error(`no ${speed} m/s rig`)
  return rig
}

/** The span fixtures' tip: it scratches every rock on planet 1 at full efficiency. */
const TIP_STEP = 400
/** Past every rig: the law's one-sub-step quantum is reached well before. */
const MAX_DRILL_STEP = 4_000
const BAND_ONE_ROCK = blockHardness(PARAMS.planetIndex, 1)

function drillAtStep(drillStep: number) {
  return vehicleStatsAt({ ...startLevels(), drill_power: drillStep, drill_tip: TIP_STEP })
}

/** A band-1 cell's drill time, in sub-steps, at a drill_power step with the fixtures' tip. */
export function subStepsAtDrillStep(drillStep: number): number {
  return subStepsPerTile(drillAtStep(drillStep), BAND_ONE_ROCK) ?? Number.MAX_SAFE_INTEGER
}

/**
 * A band-1 cell's real drill time at a drill_power step, in sub-steps before the law rounds it up
 * to a whole one: the `c` of ticket 463's bands, read from the drill rule's own work terms.
 */
export function bandOneCellCostAt(drillStep: number): BigStat {
  const subStepWork = mul(tileWorkToBreak(BAND_ONE_ROCK), fromSafeInteger(DRILL_SUBSTEPS_PER_TICK))
  return div(subStepWork, drillWorkPerTick(drillAtStep(drillStep), BAND_ONE_ROCK))
}

/** The drill quantum a drill_power step cuts planet 1 in (ticket 558, `drillQuantum.ts`). */
export function quantumAtDrillStep(drillStep: number): number {
  return drillQuantumOnPlanet(drillAtStep(drillStep), PARAMS.planetIndex)
}

/** The lowest drill_power step cutting a band-1 cell in at most the rig's sub-steps. */
export function drillStepOfRig(rig: SpeedRig): number {
  if (subStepsAtDrillStep(MAX_DRILL_STEP) > rig.subSteps) {
    throw new Error(`the drill law reaches no ${rig.speed} m/s rig`)
  }
  let [low, high] = [0, MAX_DRILL_STEP]
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (subStepsAtDrillStep(middle) <= rig.subSteps) high = middle
    else low = middle + 1
  }
  return low
}

/** Where a leg starts, in mm, and its up vector (1024-scaled); it cuts facing down. */
export interface Leg {
  start: StampPoint
  upx: number
  upy: number
}

const START_DEPTH_TILES = 2

/** Planet 1 straight down a column from two tiles under the surface. */
export function columnLeg(column: number): Leg {
  const row = surfaceRowOfColumn(column, PARAMS.radiusTiles) - START_DEPTH_TILES
  return {
    start: { xMm: column * 1000 + 500, yMm: row * 1000 + 500 },
    upx: 0,
    upy: UP_VECTOR_SCALE,
  }
}

/** Planet 1 down its radius from under a column: a slanted facing that meets the cells as stairs. */
export function radialLeg(column: number): Leg {
  const { start } = columnLeg(column)
  const length = Math.sqrt(start.xMm * start.xMm + start.yMm * start.yMm)
  const upx = Math.round((start.xMm * UP_VECTOR_SCALE) / length)
  const upy = Math.round((start.yMm * UP_VECTOR_SCALE) / length)
  return { start, upx, upy }
}

/** The straight column and the TD's tilted pose, (-48.6, 296.5) m under radial facing. */
export const COLUMN_LEG = columnLeg(30)
export const TILTED_LEG = radialLeg(-49)

/** One tick of a leg: the rig's cut at `pose` on `tick`. */
export type LegTick = (state: AuthorityState, tick: number, pose: VehiclePose) => RuleEffect

/** The live command: a `drillStep` at the pose, as the client sends it. */
export const AS_DRILL_STEP: LegTick = (state, tick, pose) => {
  const seq = state.players.p1.lastSeq + 1
  const payload = { x: pose.x, y: pose.y, facing: pose.facing, drive: NO_DRIVE }
  return applyCommand(state, { playerId: 'p1', tick, seq, type: 'drillStep', payload })
}

/** A swept carve called straight, as the span reference specs call `drillAlongSweep`. */
export function bySweptCut(cut: SweepCut<RuleEffect>): LegTick {
  return (state, tick, pose) =>
    cut({ ...state, tick }, PARAMS, 'p1', noseTileOf(pose), {
      pose,
      drive: NO_DRIVE,
      isLifting: false,
    })
}

/** A leg cut by a rig: the state before its first step, each tick's effect and where its body cut from. */
export interface LegRun {
  start: AuthorityState
  ticks: RuleEffect[]
  /** How far down the leg the body stood for each tick's cut. */
  bodyAlongMm: number[]
}

/** What a leg is cut with and how long. */
export interface LegCut {
  rig: SpeedRig
  leg: Leg
  maxTicks: number
  /** A drill_power step other than the rig's own (a major either side of it). */
  drillStep?: number
  /** Ends the leg once its cut reaches this far along it, mm; by default it runs to the core. */
  reachMm?: number
  tick?: LegTick
  /** The tick the rig is armed on, 1 by default: a later one starts the dither phase elsewhere. */
  startTick?: number
  /** Upgrade levels over the armed rig's, such as a small hold that fills on the leg. */
  upgrades?: Readonly<Record<string, number>>
  /** Commands sent once the rig is reported at the start, such as enemies to meet (ticket 564). */
  prepare?: readonly CommandIntent[]
}

/** Ends a leg this far before the point nearest the planet's centre: past it lies the core. */
const CORE_MARGIN_MM = 20_000

/**
 * The rig cutting the leg for at most `maxTicks` ticks: each step's body moves on by the law's
 * cut step where it stands, but never past where the last tick's cut let it (its report stamp at
 * the cursor), as the live body rests against an uncut face.
 */
export function cutLeg(cut: LegCut): LegRun {
  const { leg, maxTicks, reachMm, tick = AS_DRILL_STEP } = cut
  const start = armedRigStart(cut.drillStep ?? drillStepOfRig(cut.rig), cut)
  const endMm = reachMm ?? alongOf(leg, { xMm: 0, yMm: 0 }) - CORE_MARGIN_MM
  const ticks: RuleEffect[] = []
  const bodyAlongMm: number[] = []
  let state = start
  let along = 0
  for (let index = 0; index < maxTicks && reachAlongOf(leg, state) < endMm; index++) {
    along = bodyAlongAfter(state, leg, along, index === 0)
    const effect = tick(state, start.tick + 1 + index, poseAlong(leg, along))
    ticks.push(effect)
    bodyAlongMm.push(along)
    state = effect.state
  }
  return { start, ticks, bodyAlongMm }
}

/**
 * Player `p1` reported at the leg's start with the rig's drill, a deep hold and a full tank, already
 * moving down the leg at the law's cut speed: a rig named by its speed is at it, where from rest the
 * cut down gains its speed only as fast as gravity lets the body (Bjor's ruling on #724).
 */
function armedRigStart(
  drillStep: number,
  { leg, startTick: tick = 1, upgrades: over, prepare = [] }: LegCut,
): AuthorityState {
  const session = createScriptedSession()
  session.submit(tick, FREEZE_ENEMIES)
  const armed = { drill_tip: TIP_STEP, drill_power: drillStep, cargo_hold: 47, hull: 2_000 }
  const upgrades = { ...armed, ...over }
  for (const [upgradeId, level] of Object.entries(upgrades)) {
    session.submit(tick, { type: 'debug.setUpgrade', payload: { upgradeId, level } })
  }
  session.submit(tick, { type: 'debug.setEnergy', payload: { energy: '1000000000' } })
  const { payload } = poseAbove({ tx: 0, ty: 0 }, FACING.down)
  const at = { x: leg.start.xMm, y: leg.start.yMm, upx: leg.upx, upy: leg.upy }
  const moving = movingDownAtCutSpeed(session.state(), leg)
  session.submit(tick, { type: 'reportPose', payload: { ...payload, ...at, ...moving } })
  for (const intent of prepare) session.submit(tick, intent)
  return session.state()
}

/**
 * A reported velocity down `up` at the law's cut speed where `p1` stands, whole mm/s: the running
 * start a spec's rig cutting down at its speed reports (Bjor's ruling on #724), since from rest a
 * cut down gains its speed only as fast as gravity lets the body.
 */
export function movingDownAtCutSpeed(
  state: AuthorityState,
  up: { upx: number; upy: number },
): { vx: number; vy: number } {
  return movingDownAt(up, cutStepMmAt(state) * TICKS_PER_SECOND)
}

/** A velocity down `up`, `mmPerSecond` along it, in whole mm/s. */
export function movingDownAt(
  { upx, upy }: { upx: number; upy: number },
  mmPerSecond: number,
): { vx: number; vy: number } {
  const down = facingVectorOf(upx, upy, FACING.down)
  return {
    vx: Math.round((down.x * mmPerSecond) / UP_VECTOR_SCALE),
    vy: Math.round((down.y * mmPerSecond) / UP_VECTOR_SCALE),
  }
}

/**
 * The body's distance along the leg on its next step: the cut step on, into ground the cut has
 * opened (ticket 570: the cut rides the body's face, so the body moves into what the last tick
 * cut, as the live body does, never into standing ground).
 */
function bodyAlongAfter(state: AuthorityState, leg: Leg, along: number, isFirst: boolean): number {
  if (isFirst) return along
  const open = { limitMm: cutStepMmAt(state), faceWidthMm: BODY_FACE_WIDTH_MM, scanMm: 1 }
  return along + openRunAheadOf(state, leg, along, open)
}

/** The body's face across, less a sample's play each side: the width it moves into ground by. */
const BODY_FACE_WIDTH_MM = VEHICLE_COLLIDER_SIZE * MM_PER_METRE - 2 * 25

/** The law's cut step where the rig stands: the cutting bound less its tolerance. */
export function cutStepMmAt(state: AuthorityState): number {
  return stepBoundsAt(state, 'p1').cuttingMm - STEP_BOUND_TOLERANCE_MM
}

const FACE_SCAN_MM = 25

/** The body's collider face: half its 0.9 m square ahead of its centre. */
const BODY_HALF_MM = (VEHICLE_COLLIDER_SIZE * MM_PER_METRE) / 2

/**
 * How far the body's face, judged `faceWidthMm` across, can move on from `along` before it meets
 * standing ground, in scan steps up to `limitMm`.
 */
export function openRunAheadOf(
  state: AuthorityState,
  leg: Leg,
  along: number,
  { limitMm, faceWidthMm, scanMm = FACE_SCAN_MM }: OpenRun,
): number {
  const reader = groundReaderOf(state.world, PARAMS)
  const offsets = [-faceWidthMm / 2, 0, faceWidthMm / 2]
  const isOpen = (run: number) => isFaceOpenAt(reader, leg, along + run, offsets)
  const steps = scanMm < FACE_SCAN_MM ? [COARSE_SCAN_MM, FACE_SCAN_MM, scanMm] : [FACE_SCAN_MM]
  let run = 0
  for (const step of steps) {
    while (run < limitMm && isOpen(run + step)) run += step
  }
  return Math.min(run, limitMm)
}

/** A fine scan first strides half a sample at a time: thinner than any standing ground it meets. */
const COARSE_SCAN_MM = 125

/** How far to look for open ground, how wide the face is, and the finer steps that end the scan. */
interface OpenRun {
  limitMm: number
  faceWidthMm: number
  scanMm?: number
}

/** The body's face, with its centre `along` mm down the leg, lies in open ground at each offset. */
function isFaceOpenAt(
  reader: GroundReader,
  leg: Leg,
  along: number,
  offsetsMm: readonly number[],
): boolean {
  const facing = facingOfLeg(leg)
  const centre = pointAlong(leg, along + BODY_HALF_MM)
  return offsetsMm.every((acrossMm) => {
    const xMm = centre.xMm - (facing.y * acrossMm) / UP_VECTOR_SCALE
    const yMm = centre.yMm + (facing.x * acrossMm) / UP_VECTOR_SCALE
    return reader.densityAtPoint(xMm / MM_PER_METRE, yMm / MM_PER_METRE) < ISO_DENSITY
  })
}

/** Where the cut reached: the cursor, or the leg's start before any cut. */
export function reachOf(leg: Leg, state: AuthorityState): StampPoint {
  const cursor = vehicleOf(state, 'p1').sweptCut
  return cursor === undefined ? leg.start : { xMm: cursor.xMm, yMm: cursor.yMm }
}

export function reachAlongOf(leg: Leg, state: AuthorityState): number {
  return alongOf(leg, reachOf(leg, state))
}

/** The leg's facing, 1024-scaled. */
export function facingOfLeg(leg: Leg): { x: number; y: number } {
  return facingVectorOf(leg.upx, leg.upy, FACING.down)
}

/** The point `along` mm down the leg from its start. */
export function pointAlong(leg: Leg, along: number): StampPoint {
  const facing = facingOfLeg(leg)
  return {
    xMm: leg.start.xMm + Math.round((facing.x * along) / UP_VECTOR_SCALE),
    yMm: leg.start.yMm + Math.round((facing.y * along) / UP_VECTOR_SCALE),
  }
}

/** How far down the leg a point lies, in mm. */
export function alongOf(leg: Leg, point: StampPoint): number {
  const facing = facingOfLeg(leg)
  const dx = point.xMm - leg.start.xMm
  const dy = point.yMm - leg.start.yMm
  return Math.round((dx * facing.x + dy * facing.y) / UP_VECTOR_SCALE)
}

/** The pose a leg's step reports at `along`. */
export function poseAlong(leg: Leg, along: number): VehiclePose {
  const at = pointAlong(leg, along)
  return { x: at.xMm, y: at.yMm, vx: 0, vy: 0, upx: leg.upx, upy: leg.upy, facing: FACING.down }
}

/**
 * Sub-steps the leg's ticks spent, in the base quantum (a lifted one read back exactly, ticket
 * 558): a tick's work each, less what the last one carries on.
 */
export function subStepsSpentBy(run: LegRun): number {
  const cursor = vehicleOf(run.ticks[run.ticks.length - 1].state, 'p1').sweptCut
  const carried = cursor === undefined ? 0 : cursor.carrySubSteps / quantumScaleOf(cursor)
  return run.ticks.length * DRILL_SUBSTEPS_PER_TICK - carried
}

/** The cursor's dig time in base sub-steps: exact, its quantum being the base doubled (ticket 558). */
export function baseDigSubStepsOf(cursor: SweptCut | undefined): number {
  return cursor === undefined ? 0 : cursor.digSubSteps / quantumScaleOf(cursor)
}

/** How many base sub-steps one of the cursor's makes up: its quantum over 60 (ticket 558). */
function quantumScaleOf(cursor: SweptCut): number {
  return quantumOfCursor(cursor) / DRILL_SUBSTEPS_PER_TICK
}

/** Every event the leg's ticks answered. */
export function eventsOfLeg(run: LegRun): DomainEventBody[] {
  return run.ticks.flatMap(({ events }) => events)
}
