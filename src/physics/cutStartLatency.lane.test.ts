import RAPIER from '@dimforge/rapier3d-compat'
import { mkdirSync, writeFileSync } from 'node:fs'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { POSE_REPORT_INTERVAL_TICKS } from '../constants/balance'
import {
  PHYSICS_TIMESTEP,
  TICKS_PER_SECOND,
  UP_VECTOR_SCALE,
  VEHICLE_COLLIDER_SIZE,
} from '../constants/physics'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { createVehicleLoop } from '../scene/vehicleLoop'
import { readAuthorityState } from '../store/authorityLink'
import { readLocalVehicle, resetGameStore, useGameStore } from '../store/gameStore'
import type { CutFollow } from '../systems/authority/cutFollowRead'
import { buildIntent } from '../systems/input/buildIntent'
import {
  breakDownCutStart,
  type CutStartBreakdown,
  type CutStartTick,
} from '../systems/vehicle/cutStartBreakdown'
import { IDLE_INTENT, type VehicleIntent } from '../systems/vehicle/vehicleIntent'
import { facingVectorOf, type VehiclePose } from '../systems/vehicle/vehiclePose'
import type { TilePoint } from '../systems/world/tileGrid'
import { isTileYielded, type WorldState } from '../systems/world/worldState'
import type { Vector2 } from '../systems/vehicle/localFrame'
import { runFixedStepFrame, type FrameClock } from './liveFixedStep'
import {
  createVehicleBody,
  createVehicleController,
  type VehicleController,
  type VehicleStepResult,
} from './vehicleController'

// Cut start latency from rest (ticket 433, measurement only, from the TD's shape on #430): where
// the ticks go from pressing down into ground until the body follows the drill, at the starting
// drill (stored drill_power 1, 10 and 20, tip 0) and #400's two fast rigs, at 30 and 144 frames/s,
// in the live fixed-step loop with `drill.sweptCut` on. Two starts: from the planet 1 surface
// beside the pad (the head turns from left to down), and again mid-shaft after a second's rest
// (the head already faces down). A lane: it runs only when named, prints the table and writes it
// to balance-report/cut-start-latency.ndjson for comparing runs across commits. The breakdown is
// `systems/vehicle/cutStartBreakdown.ts`.

const RIGS: Readonly<Record<string, Record<string, number>>> = {
  'stored 1': { drill_power: 1, drill_tip: 0 },
  'stored 10': { drill_power: 10, drill_tip: 0 },
  'stored 20': { drill_power: 20, drill_tip: 0 },
  'rig 1 (#400)': { drill_power: 300, drill_tip: 200 },
  'rig 2 (#400)': { drill_power: 2000, drill_tip: 600, engine: 5000 },
}
const FRAME_RATES = [30, 144]
const LEGS = ['surface', 'mid-shaft'] as const
const REPORT_FOLDER = new URL('../../balance-report/', import.meta.url)
const RUN_TIMEOUT_MS = 600_000
/** Where along the line ahead, past the body's face in metres, a cell opening counts. */
const LINE_AHEAD_M = [0.05, 0.55, 1.05, 1.55, 2.05]

type Leg = (typeof LEGS)[number]

interface StartRun {
  rig: string
  framesPerSecond: number
  leg: Leg
  breakdown: CutStartBreakdown | null
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

/** Where the body stood and the authority's world, between two ticks. */
interface TickEdge {
  position: Vector2
  world: WorldState
}

/** A rig's live loop, stepped one render frame at a time. */
interface Rig {
  hold: (intent: VehicleIntent, frames: number) => CutStartTick[]
}

function createRig(levels: Record<string, number>, framesPerSecond: number): Rig {
  for (const [track, level] of Object.entries(levels)) {
    useGameStore.getState().setUpgrade(track, level)
  }
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 })
  world.timestep = PHYSICS_TIMESTEP
  const start = readLocalVehicle().pose
  if (start === null) throw new Error('the starting planet has no dock')
  const controller = createVehicleController(RAPIER, world, createVehicleBody(RAPIER, world, start))
  const loop = createVehicleLoop({ 'drill.sweptCut': true })
  const clock: FrameClock = { carried: 0 }
  let last: TickEdge = { position: controller.planetPosition(), world: readAuthorityState().world }
  const hold = (intent: VehicleIntent, frames: number) => {
    const ticks: CutStartTick[] = []
    const stepWorld = () => {
      const read = stepTick(controller, loop, intent)
      ticks.push(cutStartTickOf(read, last))
      last = { position: read.position, world: readAuthorityState().world }
    }
    for (let frame = 0; frame < frames; frame++) {
      if (frame % framesPerSecond === 0) useGameStore.getState().setEnergy('150')
      runFixedStepFrame(clock, 1 / framesPerSecond, { isHeld: () => false, stepWorld })
    }
    return ticks
  }
  return { hold }
}

/** Off the pad, a second at rest, down from the surface; a second at rest, down again. */
function playStarts(levels: Record<string, number>, framesPerSecond: number) {
  const rig = createRig(levels, framesPerSecond)
  const seconds = (count: number) => count * framesPerSecond
  // The Sell bay is the pad's west end (#170), so off the pad is to the left.
  rig.hold(buildIntent(['aim_left']), seconds(2))
  rig.hold(IDLE_INTENT, seconds(1))
  const surface = rig.hold(buildIntent(['aim_down']), seconds(4))
  rig.hold(IDLE_INTENT, seconds(1))
  return { surface, 'mid-shaft': rig.hold(buildIntent(['aim_down']), seconds(3)) }
}

/** One fixed tick through the live loop, with the cut-follow read its step took. */
function stepTick(
  controller: VehicleController,
  loop: ReturnType<typeof createVehicleLoop>,
  intent: VehicleIntent,
) {
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
  watched.stepWorld()
  if (result === null) throw new Error('the loop has not stepped the body')
  return { result: result as VehicleStepResult, read, position: controller.planetPosition() }
}

function cutStartTickOf(
  { result, read, position }: ReturnType<typeof stepTick>,
  before: TickEdge,
): CutStartTick {
  return {
    speed: speedAlongFacing(result.pose, position, before.position),
    isDrilling: result.flags.isDrilling,
    isCutting: result.isCutting,
    cutSpeed: read?.cutSpeed ?? 0,
    opensCell: opensCellAhead(result.pose, position, before.world),
  }
}

/** m/s along the facing, from the body's move through the tick. */
function speedAlongFacing(pose: VehiclePose, after: Vector2, before: Vector2): number {
  const facing = facingVectorOf(pose.upx, pose.upy, pose.facing)
  const along = (after.x - before.x) * facing.x + (after.y - before.y) * facing.y
  return along / UP_VECTOR_SCALE / PHYSICS_TIMESTEP
}

/**
 * A cell on the line ahead of the body's face, from the face to two cells past it, yielded in the
 * tick: standing in the authority's world before the tick, open after it.
 */
function opensCellAhead(pose: VehiclePose, position: Vector2, before: WorldState): boolean {
  const after = readAuthorityState().world
  return tilesAheadOf(pose, position).some(
    (tile) => !isTileYielded(before, tile) && isTileYielded(after, tile),
  )
}

function tilesAheadOf(pose: VehiclePose, position: Vector2): TilePoint[] {
  const facing = facingVectorOf(pose.upx, pose.upy, pose.facing)
  return LINE_AHEAD_M.map((past) => {
    const reach = VEHICLE_COLLIDER_SIZE / 2 + past
    return {
      tx: Math.floor(position.x + (facing.x / UP_VECTOR_SCALE) * reach),
      ty: Math.floor(position.y + (facing.y / UP_VECTOR_SCALE) * reach),
    }
  })
}

function runAllStarts(): StartRun[] {
  return Object.entries(RIGS).flatMap(([rig, levels]) =>
    FRAME_RATES.flatMap((framesPerSecond) => {
      resetGameStore()
      const starts = playStarts(levels, framesPerSecond)
      return LEGS.map((leg) => ({
        rig,
        framesPerSecond,
        leg,
        breakdown: breakDownCutStart(starts[leg]),
      }))
    }),
  )
}

/**
 * The stale-facing ticks of a turn from driving into a cut: the rig drives left off the pad one
 * tick longer each time, so the press of down lands on each phase of the pose report's interval,
 * one frame a tick. (From rest the report is due at once, so the phase is always the same.)
 */
function staleFacingByReportPhase(): number[] {
  return Array.from({ length: POSE_REPORT_INTERVAL_TICKS }, (_, phase) => {
    resetGameStore()
    const rig = createRig(RIGS['stored 1'], TICKS_PER_SECOND)
    rig.hold(buildIntent(['aim_left']), 2 * TICKS_PER_SECOND + phase)
    const breakdown = breakDownCutStart(rig.hold(buildIntent(['aim_down']), TICKS_PER_SECOND))
    return breakdown?.staleFacingTicks ?? -1
  })
}

function seconds(ticks: number): string {
  return (ticks / TICKS_PER_SECOND).toFixed(2)
}

function formatStartTable(runs: readonly StartRun[]): string {
  const header =
    'rig | fps | start | vCut m/s | cell ticks | swivel | stale facing | first cell | held | ' +
    'second stall | standing (s) | first cell open (s)'
  const rows = runs.map(({ rig, framesPerSecond, leg, breakdown: b }) =>
    b === null
      ? `${rig} | ${framesPerSecond} | ${leg} | no cell opened`
      : [
          rig,
          framesPerSecond,
          leg,
          b.cutSpeed.toFixed(2),
          b.cellTicks.toFixed(1),
          b.swivelTicks,
          b.staleFacingTicks,
          b.firstCellTicks,
          b.heldTicks ?? '-',
          b.secondStallTicks,
          `${b.standingTicks} (${seconds(b.standingTicks)})`,
          `${b.firstCellOpenTick} (${seconds(b.firstCellOpenTick)})`,
        ].join(' | '),
  )
  return [header, ...rows].join('\n')
}

function writeStartReport(runs: readonly StartRun[], staleByPhase: readonly number[]): void {
  const lines = [
    { report: 'cut-start-latency', ticket: 433, staleFacingByReportPhase: staleByPhase },
    ...runs,
  ]
  mkdirSync(REPORT_FOLDER, { recursive: true })
  const text = lines.map((line) => JSON.stringify(line)).join('\n')
  writeFileSync(new URL('cut-start-latency.ndjson', REPORT_FOLDER), `${text}\n`)
}

describe('cut start latency from rest (ticket 433)', () => {
  let runs: StartRun[] = []
  let staleByPhase: number[] = []

  beforeAll(() => {
    runs = runAllStarts()
    staleByPhase = staleFacingByReportPhase()
    console.log(formatStartTable(runs))
    console.log(`stale facing turning from a drive, by report phase: ${staleByPhase.join(' ')}`)
    writeStartReport(runs, staleByPhase)
  }, RUN_TIMEOUT_MS)

  it('opens a first cell on every rig and start', () => {
    expect(runs.filter(({ breakdown }) => breakdown === null)).toEqual([])
  })

  it('starts alike at 30 and 144 frames/s', () => {
    for (const leg of LEGS) {
      for (const rig of Object.keys(RIGS)) {
        const [slow, fast] = FRAME_RATES.map(
          (rate) =>
            runs.find((run) => run.rig === rig && run.leg === leg && run.framesPerSecond === rate)
              ?.breakdown,
        )
        expect(fast).toEqual(slow)
      }
    }
  })

  it('reads a stale facing for at most one pose report interval after the head turns', () => {
    expect(staleByPhase.every((ticks) => ticks >= 0 && ticks <= POSE_REPORT_INTERVAL_TICKS)).toBe(
      true,
    )
  })
})
