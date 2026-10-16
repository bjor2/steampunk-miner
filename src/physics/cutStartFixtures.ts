/**
 * The live-loop rig the cut-start lanes drive (ticket 433, shared with ticket 504): a Rapier world,
 * the vehicle controller and the fixed-step loop with `drill.sweptCut` on, held one render frame
 * at a time at a given frame rate, each fixed tick read into a `CutStartTick`. Energy is topped up
 * once a second of frames, and a hold counts render frames, not ticks: the fast rigs are still
 * bouncing when they "rest", so where a start lands depends on that script, and #433's numbers
 * (rig 1's mid-shaft stale facing among them) are read off exactly this one. The lanes reset the
 * store and install a run log around it.
 */
import type RAPIER from '@dimforge/rapier3d-compat'
import { PHYSICS_TIMESTEP, UP_VECTOR_SCALE, VEHICLE_COLLIDER_SIZE } from '../constants/physics'
import { createVehicleLoop } from '../scene/vehicleLoop'
import { readAuthorityState } from '../store/authorityLink'
import { readAuthorityTick, readLocalVehicle, useGameStore } from '../store/gameStore'
import type { CutFollow } from '../systems/authority/cutFollowRead'
import { buildIntent } from '../systems/input/buildIntent'
import type { CutStartTick } from '../systems/vehicle/cutStartBreakdown'
import type { Vector2 } from '../systems/vehicle/localFrame'
import { IDLE_INTENT, type VehicleIntent } from '../systems/vehicle/vehicleIntent'
import { facingVectorOf, type VehiclePose } from '../systems/vehicle/vehiclePose'
import type { TilePoint } from '../systems/world/tileGrid'
import { isTileYielded, type WorldState } from '../systems/world/worldState'
import { runFixedStepFrame, type FrameClock } from './liveFixedStep'
import {
  createVehicleBody,
  createVehicleController,
  type VehicleController,
  type VehicleStepResult,
} from './vehicleController'

/** Where along the line ahead, past the body's face in metres, a cell opening counts. */
const LINE_AHEAD_M = [1 / 20, 0.55, 1.05, 1.55, 2.05]

export const START_LEGS = ['surface', 'mid-shaft'] as const
export type StartLeg = (typeof START_LEGS)[number]

/** A rig's live loop, held one render frame at a time. */
export interface FrameRig {
  hold: (intent: VehicleIntent, frames: number) => CutStartTick[]
}

/** One press read from its first tick: the authority's tick before it, and the ticks it held. */
export interface PressRead {
  /** The authority's tick before the press; the press's first tick is the one after. */
  tickBefore: number
  ticks: CutStartTick[]
}

/** Where the body stood and the authority's world, between two ticks. */
interface TickEdge {
  position: Vector2
  world: WorldState
}

/** The rig on the dock with `levels` bought; the caller has reset the store. */
export function createFrameRig(
  rapier: typeof RAPIER,
  levels: Record<string, number>,
  framesPerSecond: number,
): FrameRig {
  for (const [track, level] of Object.entries(levels)) {
    useGameStore.getState().setUpgrade(track, level)
  }
  const world = new rapier.World({ x: 0, y: 0, z: 0 })
  world.timestep = PHYSICS_TIMESTEP
  const start = readLocalVehicle().pose
  if (start === null) throw new Error('the starting planet has no dock')
  const controller = createVehicleController(rapier, world, createVehicleBody(rapier, world, start))
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

/** Holds `intent` for `frames`, read with the authority's tick before its first step. */
export function holdPress(rig: FrameRig, intent: VehicleIntent, frames: number): PressRead {
  const tickBefore = readAuthorityTick()
  return { tickBefore, ticks: rig.hold(intent, frames) }
}

/**
 * #433's script: off the pad, a second at rest, down from the surface for 4 s; at rest again
 * (a second, or `midShaftRestFrames`), and down again mid-shaft for 3 s.
 */
export function playStarts(
  rig: FrameRig,
  framesPerSecond: number,
  midShaftRestFrames = framesPerSecond,
): Record<StartLeg, PressRead> {
  const seconds = (count: number) => count * framesPerSecond
  // The Sell bay is the pad's west end (#170), so off the pad is to the left.
  rig.hold(buildIntent(['aim_left']), seconds(2))
  rig.hold(IDLE_INTENT, seconds(1))
  const surface = holdPress(rig, buildIntent(['aim_down']), seconds(4))
  rig.hold(IDLE_INTENT, midShaftRestFrames)
  return { surface, 'mid-shaft': holdPress(rig, buildIntent(['aim_down']), seconds(3)) }
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
