import RAPIER from '@dimforge/rapier3d-compat'
import { mkdirSync, writeFileSync } from 'node:fs'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { DEV_FLAGS } from '../constants/devFlags'
import { CUT_FOLLOW_TICKS } from '../constants/balance'
import { MM_PER_METRE, PHYSICS_TIMESTEP, UP_VECTOR_SCALE } from '../constants/physics'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { createVehicleLoop } from '../scene/vehicleLoop'
import { readAuthorityState } from '../store/authorityLink'
import { readLocalVehicle, resetGameStore, useGameStore } from '../store/gameStore'
import type { CutFollow } from '../systems/authority/cutFollowRead'
import { planetParamsOf } from '../systems/authority/planetOfState'
import { stepBoundsAt } from '../systems/authority/stepBoundRead'
import { buildIntent } from '../systems/input/buildIntent'
import {
  kindOfBodySpeedTick,
  summariseBodySpeed,
  type BodySpeedSummary,
  type BodySpeedTick,
} from '../systems/vehicle/bodySpeedDips'
import type { Vector2 } from '../systems/vehicle/localFrame'
import { stepBoundMmOf } from '../systems/vehicle/stepBound'
import { tickPlanOf } from '../systems/vehicle/tickPlan'
import type { VehicleIntent } from '../systems/vehicle/vehicleIntent'
import { facingVectorOf, type VehiclePose } from '../systems/vehicle/vehiclePose'
import { groundReaderOf } from '../systems/world/groundReader'
import { ISO_DENSITY } from '../systems/world/sampleGrid'
import type { WorldState } from '../systems/world/worldState'
import { runFixedStepFrame, type FrameClock } from './liveFixedStep'
import {
  createVehicleBody,
  createVehicleController,
  type VehicleController,
  type VehicleStepResult,
} from './vehicleController'

// Fast-rig body speed while cutting (ticket 440, measurement only, from the TD's open finding on
// #397): a per-tick trace of the drill's `vCut`, the speed the motor commands, the body's speed
// over the tick and after its contacts, the step bound, the substeps, the cut's reach past the
// body and the gate, for #400's down leg on planet 1 at 30 and 144 frames/s with `drill.sweptCut`
// on. Each steady cut tick is named by `systems/vehicle/bodySpeedDips.ts`. The rigs are stored
// levels; past #396's 4-tick floor (#397 removes it) they cut at 25, 44, 56, 62 and 78 m/s, under
// it all of them cut at 15 m/s. A lane: it runs only when named, prints the table and writes the
// trace to balance-report/fast-rig-body-speed.ndjson for comparing runs across commits.
//
// Since ticket 459 the substeps collide with the world the tick's own cut left, so no steady tick
// dips at all, and no tick moves the body slower than commanded (GD ruling 6209399402 on #459). The
// down leg's distance and its gate-shut ticks are logged; the body now reaches the cut's front and
// waits there for the cut (#492), so the gate-shut count is held to the recorded rows.

const RIGS: Readonly<Record<string, Record<string, number>>> = {
  'stored 250/600': { drill_power: 250, drill_tip: 600 },
  'rig 1 (#400)': { drill_power: 300, drill_tip: 200 },
  'stored 320/600': { drill_power: 320, drill_tip: 600 },
  'stored 330/600': { drill_power: 330, drill_tip: 600 },
  'stored 350/600': { drill_power: 350, drill_tip: 600 },
}
const FRAME_RATES = [30, 144]
const DOWN_LEG_SECONDS = 3
const REPORT_FOLDER = new URL('../../balance-report/', import.meta.url)
const RUN_TIMEOUT_MS = 600_000
/**
 * The down leg's gate-shut ticks with ticket 459's halo sync, at both frame rates (GD ruling
 * 6209399402 on #459): may only shrink, as #492 keeps the cut ahead of the body.
 */
const GATE_SHUT_TICKS_MAX: Readonly<Record<string, number>> = {
  'stored 250/600': 35,
  'rig 1 (#400)': 42,
  'stored 320/600': 75,
  'stored 330/600': 41,
  'stored 350/600': 76,
}
/** The body's half width, and the slab's sample spacing across and along it (half a sample). */
const BODY_HALF_M = 0.45
const SLAB_SPACING_M = 0.125

/** One fixed tick of the down leg, as the trace writes it. */
interface TraceTick {
  tick: number
  vCut: number | null
  gate: 0 | 1 | null
  commanded: number
  speed: number
  endSpeed: number
  boundMm: number
  substeps: number | 'sweep'
  reachMm: number | null
  isSteady: boolean
  slabSolidBefore: number
  slabSolidAfter: number
}

interface LegRun {
  rig: string
  framesPerSecond: number
  ticks: TraceTick[]
  summary: BodySpeedSummary
  /** How far the body moved along its facing over the down leg, in m. */
  distanceM: number
  /** Ticks of the down leg the cut gate stood shut. */
  gateShutTicks: number
}

/** What one tick of the live loop left, with the cut-follow read its step took. */
interface SteppedTick {
  result: VehicleStepResult
  read: CutFollow | undefined
  commanded: Vector2
  position: Vector2
}

beforeAll(async () => {
  await RAPIER.init()
})

beforeEach(() => {
  resetGameStore()
  installRunLog(
    createRunLog({ runId: 'run_test', sink: createMemorySink(), secondsSinceStart: () => 0 }),
  )
})

afterEach(() => uninstallRunLog())

/** Off the pad, then #400's down leg, traced tick by tick. */
function playDownLeg(levels: Record<string, number>, framesPerSecond: number): TraceTick[] {
  for (const [track, level] of Object.entries(levels)) {
    useGameStore.getState().setUpgrade(track, level)
  }
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 })
  world.timestep = PHYSICS_TIMESTEP
  const start = readLocalVehicle().pose
  if (start === null) throw new Error('the starting planet has no dock')
  const placed = createVehicleBody(RAPIER, world, start)
  const controller = createVehicleController(RAPIER, world, placed)
  const loop = createVehicleLoop({ ...DEV_FLAGS, 'drill.sweptCut': true })
  const clock: FrameClock = { carried: 0 }
  const hold = (intent: VehicleIntent, seconds: number) => {
    const ticks: TraceTick[] = []
    const reads: (CutFollow | undefined)[] = []
    const stepWorld = () => {
      const before = { position: controller.planetPosition(), world: readAuthorityState().world }
      const stepped = stepTick(controller, loop, intent, () => placed.body.linvel())
      reads.push(stepped.read)
      ticks.push(traceTickOf(stepped, before, vectorOf(placed.body.linvel()), reads))
    }
    for (let frame = 0; frame < seconds * framesPerSecond; frame++) {
      if (frame % framesPerSecond === 0) useGameStore.getState().setEnergy('150')
      runFixedStepFrame(clock, 1 / framesPerSecond, { isHeld: () => false, stepWorld })
    }
    return ticks
  }
  // The Sell bay is the pad's west end (#170), so off the pad is to the left.
  hold(buildIntent(['aim_left']), 2)
  return hold(buildIntent(['aim_down']), DOWN_LEG_SECONDS)
}

/** One fixed tick: the motor's step, the velocity it set before the world stepped, the step. */
function stepTick(
  controller: VehicleController,
  loop: ReturnType<typeof createVehicleLoop>,
  intent: VehicleIntent,
  bodyVelocity: () => { x: number; y: number },
): SteppedTick {
  let result: VehicleStepResult | null = null
  let read: CutFollow | undefined
  const watched: VehicleController = {
    ...controller,
    step: (input, planet) => {
      const cutFollowOf = input.cutFollowOf
      const reading =
        cutFollowOf && ((step: Parameters<typeof cutFollowOf>[0]) => (read = cutFollowOf(step)))
      result = controller.step({ ...input, cutFollowOf: reading }, planet)
      return result
    },
  }
  loop.step(watched, intent)
  const commanded = vectorOf(bodyVelocity())
  watched.stepWorld()
  if (result === null) throw new Error('the loop has not stepped the body')
  return { result, read, commanded, position: controller.planetPosition() }
}

function traceTickOf(
  { result, read, commanded, position }: SteppedTick,
  before: { position: Vector2; world: WorldState },
  endVelocity: Vector2,
  reads: readonly (CutFollow | undefined)[],
): TraceTick {
  const facing = unitFacingOf(result.pose)
  const commandedAlong = along(commanded, facing)
  const slab = slabPointsOf(before.position, facing, commandedAlong * PHYSICS_TIMESTEP)
  const state = readAuthorityState()
  const bounds = stepBoundsAt(state, useGameStore.getState().playerId)
  return {
    tick: state.tick,
    vCut: read?.cutSpeed ?? null,
    gate: read?.gate.cutGate ?? null,
    commanded: commandedAlong,
    speed: along(minus(position, before.position), facing) / PHYSICS_TIMESTEP,
    endSpeed: along(endVelocity, facing),
    boundMm: stepBoundMmOf(bounds, result.isCutting),
    substeps: substepsOf(commanded),
    reachMm: reachPastBodyMm(position, facing),
    isSteady: isSteadyCut(result, reads, commandedAlong),
    slabSolidBefore: countSolid(before.world, slab),
    slabSolidAfter: countSolid(state.world, slab),
  }
}

/**
 * The gate open over ground to cut, the drill's speed unchanged over the ramp before it (the
 * #400 spec's held window), so the commanded speed is the drill's and not a ramp's.
 */
function isSteadyCut(
  result: VehicleStepResult,
  reads: readonly (CutFollow | undefined)[],
  commanded: number,
): boolean {
  const window = reads.slice(-(CUT_FOLLOW_TICKS + 2))
  const speed = window[window.length - 1]?.cutSpeed
  const isUnchanged = window.every((read) => read !== undefined && read.cutSpeed === speed)
  const isOverGround = window[window.length - 1]?.isSlabClear !== true
  const isFull = window.length === CUT_FOLLOW_TICKS + 2 && commanded > 0
  return result.isCutting && isUnchanged && isOverGround && isFull
}

/** Sample points of the slab the commanded move sweeps: from the body's face, across the body. */
function slabPointsOf(from: Vector2, facing: Vector2, stepM: number): Vector2[] {
  const points: Vector2[] = []
  const across = { x: -facing.y, y: facing.x }
  for (let ahead = BODY_HALF_M; ahead <= BODY_HALF_M + stepM; ahead += SLAB_SPACING_M) {
    for (let side = -BODY_HALF_M; side <= BODY_HALF_M; side += SLAB_SPACING_M) {
      points.push({
        x: from.x + facing.x * ahead + across.x * side,
        y: from.y + facing.y * ahead + across.y * side,
      })
    }
  }
  return points
}

function countSolid(world: WorldState, points: readonly Vector2[]): number {
  const params = planetParamsOf(readAuthorityState().planet)
  if (params === null) return 0
  const ground = groundReaderOf(world, params)
  return points.filter(({ x, y }) => ground.densityAtPoint(x, y) >= ISO_DENSITY).length
}

/** How far the swept cut's cursor stands past the body's centre along the facing, in mm. */
function reachPastBodyMm(position: Vector2, facing: Vector2): number | null {
  const cursor = readLocalVehicle().sweptCut
  if (cursor === undefined) return null
  const cursorM = { x: cursor.xMm / MM_PER_METRE, y: cursor.yMm / MM_PER_METRE }
  return Math.round(along(minus(cursorM, position), facing) * MM_PER_METRE)
}

function substepsOf(velocity: Vector2): number | 'sweep' {
  const stepMm = Math.hypot(velocity.x, velocity.y) * PHYSICS_TIMESTEP * MM_PER_METRE
  const plan = tickPlanOf(stepMm)
  return plan.kind === 'sweep' ? 'sweep' : plan.count
}

function unitFacingOf(pose: VehiclePose): Vector2 {
  const facing = facingVectorOf(pose.upx, pose.upy, pose.facing)
  return { x: facing.x / UP_VECTOR_SCALE, y: facing.y / UP_VECTOR_SCALE }
}

function along(vector: Vector2, facing: Vector2): number {
  return vector.x * facing.x + vector.y * facing.y
}

function minus(a: Vector2, b: Vector2): Vector2 {
  return { x: a.x - b.x, y: a.y - b.y }
}

function vectorOf({ x, y }: { x: number; y: number }): Vector2 {
  return { x, y }
}

/** The steady cut ticks of a leg, as the classifier reads them. */
function steadyTicksOf(ticks: readonly TraceTick[]): BodySpeedTick[] {
  return ticks.filter((tick) => tick.isSteady)
}

function runAllLegs(): LegRun[] {
  return Object.entries(RIGS).flatMap(([rig, levels]) =>
    FRAME_RATES.map((framesPerSecond) => {
      resetGameStore()
      const ticks = playDownLeg(levels, framesPerSecond)
      const summary = summariseBodySpeed(steadyTicksOf(ticks))
      const distanceM = distanceCoveredM(ticks)
      return { rig, framesPerSecond, ticks, summary, distanceM, gateShutTicks: gateShutOf(ticks) }
    }),
  )
}

function gateShutOf(ticks: readonly TraceTick[]): number {
  return ticks.filter((tick) => tick.gate === 0).length
}

function distanceCoveredM(ticks: readonly TraceTick[]): number {
  return ticks.reduce((metres, tick) => metres + tick.speed * PHYSICS_TIMESTEP, 0)
}

/** The lowest share under 1.00 at the table's two decimals; a held tick reads 0.99995 in float. */
function isSlowerThanCommanded({ lowestShare }: BodySpeedSummary): boolean {
  return Math.round(lowestShare * 100) < 100
}

function vCutsOf(ticks: readonly TraceTick[]): string {
  const speeds = new Set(ticks.filter((tick) => tick.isSteady).map((tick) => tick.vCut))
  return [...speeds].map((speed) => speed?.toFixed(2)).join('/')
}

function formatLegTable(runs: readonly LegRun[]): string {
  const header =
    'rig | fps | vCut m/s | steady ticks | dips | stale halo | uncut ground | unexplained | lowest share | down leg m | gate shut'
  const rows = runs.map(({ rig, framesPerSecond, ticks, summary: s, distanceM, gateShutTicks }) =>
    [
      rig,
      framesPerSecond,
      vCutsOf(ticks),
      s.ticks,
      s.dips,
      s.staleHalo,
      s.uncutGround,
      s.unexplained,
      s.lowestShare.toFixed(2),
      distanceM.toFixed(1),
      gateShutTicks,
    ].join(' | '),
  )
  return [header, ...rows].join('\n')
}

function writeLegReport(runs: readonly LegRun[]): void {
  const lines = runs.flatMap(({ rig, framesPerSecond, ticks, summary, ...leg }) => [
    { report: 'fast-rig-body-speed', ticket: 440, rig, framesPerSecond, summary, ...leg },
    ...ticks.map((tick) => ({ rig, framesPerSecond, ...tick, kind: kindOf(tick) })),
  ])
  mkdirSync(REPORT_FOLDER, { recursive: true })
  const text = lines.map((line) => JSON.stringify(line)).join('\n')
  writeFileSync(new URL('fast-rig-body-speed.ndjson', REPORT_FOLDER), `${text}\n`)
}

function kindOf(tick: TraceTick): string | null {
  return tick.isSteady ? kindOfBodySpeedTick(tick) : null
}

describe('fast-rig body speed while cutting (ticket 440)', () => {
  let runs: LegRun[] = []

  beforeAll(() => {
    runs = runAllLegs()
    console.log(formatLegTable(runs))
    writeLegReport(runs)
  }, RUN_TIMEOUT_MS)

  it('cuts down on every rig, with steady cut ticks to name', () => {
    expect(runs.filter(({ summary }) => summary.ticks === 0).map(({ rig }) => rig)).toEqual([])
  })

  it('traces alike at 30 and 144 frames/s', () => {
    for (const rig of Object.keys(RIGS)) {
      const [slow, fast] = FRAME_RATES.map(
        (rate) => runs.find((run) => run.rig === rig && run.framesPerSecond === rate)?.ticks,
      )
      expect(fast).toEqual(slow)
    }
  })

  it('dips on no steady tick of any rig, at 30 and 144 frames/s (ticket 459)', () => {
    const dipping = runs.filter(({ summary }) => summary.dips > 0)
    expect(dipping.map(({ rig, framesPerSecond }) => `${rig} ${framesPerSecond}`)).toEqual([])
  })

  it('moves the body no slower than commanded on any steady tick of any rig (ticket 459)', () => {
    const slower = runs.filter(({ summary }) => isSlowerThanCommanded(summary))
    expect(slower.map(({ rig, summary }) => `${rig}: ${summary.lowestShare}`)).toEqual([])
  })

  it('holds the cut gate shut no more ticks than recorded on any rig (ticket 459, #492)', () => {
    const shutLonger = runs.filter(
      ({ rig, gateShutTicks }) => gateShutTicks > GATE_SHUT_TICKS_MAX[rig],
    )
    expect(shutLonger.map(({ rig, gateShutTicks }) => `${rig}: ${gateShutTicks}`)).toEqual([])
  })
})
