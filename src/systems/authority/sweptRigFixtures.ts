/**
 * Rigs by cut speed on planet 1 (ticket 439, the TD shape on #397): each rig is named by the speed
 * the drill law cuts band-1 rock at, 3600 / n m/s at n sub-steps a cell, its drill found by
 * `subStepsPerTile` rather than stored, and cut a tick at a time down a leg of real ground, its
 * body keeping pace with the cut as the live body does. Only specs use them.
 *
 * Planet radii run 300 to just under 1000 tiles, so a 3 s leg fits only rigs up to about 300 m/s;
 * a leg here is a tick count that ends where the body nears the planet's centre (3600 m/s crosses
 * planet 1 in about 5 ticks).
 *
 * A rig the law cannot reach today has no drill step (`drillStepOfRig` answers null): ticket 396's
 * 4-tick floor holds every drill to 240 sub-steps a cell until #397 removes it.
 */
import { DRILL_STAMP_AHEAD_MM, STEP_BOUND_TOLERANCE_MM } from '../../constants/balance'
import { UP_VECTOR_SCALE } from '../../constants/physics'
import { blockHardness } from '../economy/oreEconomy'
import { startLevels, vehicleStatsAt } from '../economy/vehicleStats'
import { NO_DRIVE } from '../vehicle/driveSigns'
import { subStepsPerTile } from '../vehicle/drillRule'
import { FACING, facingVectorOf, noseTileOf, type VehiclePose } from '../vehicle/vehiclePose'
import type { StampPoint } from '../world/stampShape'
import { surfaceRowOfColumn } from '../world/tileGrid'
import { applyCommand } from './applyCommand'
import { vehicleOf, type AuthorityState } from './authorityState'
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

/** A band-1 cell's drill time, in sub-steps, at a drill_power step with the fixtures' tip. */
function subStepsAtDrillStep(drillStep: number): number {
  const levels = { ...startLevels(), drill_power: drillStep, drill_tip: TIP_STEP }
  return subStepsPerTile(vehicleStatsAt(levels), BAND_ONE_ROCK) ?? Number.MAX_SAFE_INTEGER
}

/** The lowest drill_power step cutting a band-1 cell in at most the rig's sub-steps; null past the law. */
export function drillStepOfRig(rig: SpeedRig): number | null {
  if (subStepsAtDrillStep(MAX_DRILL_STEP) > rig.subSteps) return null
  let [low, high] = [0, MAX_DRILL_STEP]
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (subStepsAtDrillStep(middle) <= rig.subSteps) high = middle
    else low = middle + 1
  }
  return low
}

function drillStepNeeded(rig: SpeedRig): number {
  const drillStep = drillStepOfRig(rig)
  if (drillStep === null) throw new Error(`the drill law reaches no ${rig.speed} m/s rig`)
  return drillStep
}

export function isRigInLaw(rig: SpeedRig): boolean {
  return drillStepOfRig(rig) !== null
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
  const payload = { x: pose.x, y: pose.y, drive: NO_DRIVE }
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

/** A leg cut by a rig: the state before its first step, and each tick's effect. */
export interface LegRun {
  start: AuthorityState
  ticks: RuleEffect[]
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
  const start = armedRigStart(cut.drillStep ?? drillStepNeeded(cut.rig), leg)
  const endMm = reachMm ?? alongOf(leg, { xMm: 0, yMm: 0 }) - CORE_MARGIN_MM
  const ticks: RuleEffect[] = []
  let state = start
  let along = 0
  for (let index = 0; index < maxTicks && reachAlongOf(leg, state) < endMm; index++) {
    along = bodyAlongAfter(state, leg, along, index === 0)
    const effect = tick(state, start.tick + 1 + index, poseAlong(leg, along))
    ticks.push(effect)
    state = effect.state
  }
  return { start, ticks }
}

/** Player `p1` reported at the leg's start with the rig's drill, a deep hold and a full tank. */
function armedRigStart(drillStep: number, leg: Leg): AuthorityState {
  const session = createScriptedSession()
  const tick = 1
  session.submit(tick, FREEZE_ENEMIES)
  const upgrades = { drill_tip: TIP_STEP, drill_power: drillStep, cargo_hold: 2_000, hull: 2_000 }
  for (const [upgradeId, level] of Object.entries(upgrades)) {
    session.submit(tick, { type: 'debug.setUpgrade', payload: { upgradeId, level } })
  }
  session.submit(tick, { type: 'debug.setEnergy', payload: { energy: '1000000000' } })
  const { payload } = poseAbove({ tx: 0, ty: 0 }, FACING.down)
  const pose = { ...payload, x: leg.start.xMm, y: leg.start.yMm, upx: leg.upx, upy: leg.upy }
  session.submit(tick, { type: 'reportPose', payload: pose })
  return session.state()
}

/** The body's distance along the leg on its next step: the cut step on, held behind the cut. */
function bodyAlongAfter(state: AuthorityState, leg: Leg, along: number, isFirst: boolean): number {
  if (isFirst) return along
  const cutStep = stepBoundsAt(state, 'p1').cuttingMm - STEP_BOUND_TOLERANCE_MM
  const cutLets = reachAlongOf(leg, state) - DRILL_STAMP_AHEAD_MM
  return Math.max(along, Math.min(along + cutStep, cutLets))
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

/** Every event the leg's ticks answered. */
export function eventsOfLeg(run: LegRun): DomainEventBody[] {
  return run.ticks.flatMap(({ events }) => events)
}
