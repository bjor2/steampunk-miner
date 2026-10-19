/**
 * The live-loop rig the cut-follow specs drive (ticket 430): a Rapier world, the vehicle controller
 * and the fixed-step loop with `drill.sweptCut` on (or the flags a spec passes, as the flag-off
 * level legs of ticket 516 do), stepped one render frame at a time at a given
 * frame rate, each fixed tick read after it (the step's result, the cut-follow read it took, the
 * body's move along its facing, a cell opening on the line ahead, the authority's gate). Test
 * support for `cutFollowStartingRigs.test.ts` and `cutFollowRelease.test.ts`; the specs reset the
 * store and install a run log around it.
 */
import type RAPIER from '@dimforge/rapier3d-compat'
import { DEV_FLAGS, type DevFlags } from '../constants/devFlags'
import { PHYSICS_TIMESTEP, UP_VECTOR_SCALE, VEHICLE_COLLIDER_SIZE } from '../constants/physics'
import { createVehicleLoop } from '../scene/vehicleLoop'
import { readAuthorityState } from '../store/authorityLink'
import {
  readAuthorityTick,
  readLocalVehicle,
  resetGameStore,
  useGameStore,
} from '../store/gameStore'
import type { CutFollow } from '../systems/authority/cutFollowRead'
import { planetParamsOf } from '../systems/authority/planetOfState'
import type { Vector2 } from '../systems/vehicle/localFrame'
import type { VehicleIntent } from '../systems/vehicle/vehicleIntent'
import { groundProbeOf } from '../systems/vehicle/vehicleMotion'
import { facingVectorOf, type VehiclePose } from '../systems/vehicle/vehiclePose'
import { groundReaderOf } from '../systems/world/groundReader'
import { ISO_DENSITY } from '../systems/world/sampleGrid'
import type { TilePoint } from '../systems/world/tileGrid'
import { isTileYielded, type WorldState } from '../systems/world/worldState'
import { runFixedStepFrame, type FrameClock } from './liveFixedStep'
import {
  createVehicleBody,
  createVehicleController,
  type VehicleController,
  type VehicleStepResult,
} from './vehicleController'

/** Where along the line ahead, past the body's face in metres, a cell opening counts (#433). */
const LINE_AHEAD_M = [1 / 20, 0.55, 1.05, 1.55, 2.05]
const SWEPT_CUT_ON: DevFlags = { ...DEV_FLAGS, 'drill.sweptCut': true }

/** One fixed tick of a script, read after it. */
export interface TickRead {
  result: VehicleStepResult
  /** The cut-follow read the step took; undefined with none. */
  read: CutFollow | undefined
  /** The body's centre after the tick, planet metres. */
  position: Vector2
  /** m/s along the facing over the tick. */
  speed: number
  /** A cell on the line ahead of the body's face opened in the tick. */
  opensCell: boolean
  /** The gate the tick's drill step left on the cursor, or null when no step landed. */
  authorityGate: 0 | 1 | null
  isInsideGround: boolean
  /** Solid ground lies just under the wheels after the tick. */
  isOnGround: boolean
  /** Energy quanta the tick's commands took from the tank (the rig's refill before it excluded). */
  energySpent: number
}

/** A rig's live loop, stepped one render frame at a time. */
export interface Rig {
  /** `observe` reads the world after each fixed tick, the frame's later ticks not yet run. */
  hold: (intent: VehicleIntent, ticks: number, observe?: (read: TickRead) => void) => TickRead[]
}

/** A fresh store and world with `levels` bought, the rig on the dock of `planetIndex` (planet 1). */
export function createRig(
  rapier: typeof RAPIER,
  levels: Record<string, number>,
  framesPerSecond: number,
  flags: DevFlags = SWEPT_CUT_ON,
  planetIndex = 1,
): Rig {
  resetGameStore()
  if (planetIndex !== 1) useGameStore.getState().setPlanet(planetIndex)
  for (const [track, level] of Object.entries(levels)) {
    useGameStore.getState().setUpgrade(track, level)
  }
  const world = new rapier.World({ x: 0, y: 0, z: 0 })
  world.timestep = PHYSICS_TIMESTEP
  const start = readLocalVehicle().pose
  if (start === null) throw new Error('the starting planet has no dock')
  const controller = createVehicleController(rapier, world, createVehicleBody(rapier, world, start))
  const loop = createVehicleLoop(flags)
  const clock: FrameClock = { carried: 0 }
  let last = { position: controller.planetPosition(), world: readAuthorityState().world }
  let stepped = 0
  const hold = (intent: VehicleIntent, ticks: number, observe?: (read: TickRead) => void) => {
    const reads: TickRead[] = []
    const stepWorld = () => {
      if (stepped++ % 60 === 0) useGameStore.getState().setEnergy('150')
      const read = stepTick(controller, loop, intent, last)
      reads.push(read)
      observe?.(read)
      last = { position: read.position, world: readAuthorityState().world }
    }
    while (reads.length < ticks) {
      runFixedStepFrame(clock, 1 / framesPerSecond, { isHeld: () => false, stepWorld })
    }
    return reads.slice(0, ticks)
  }
  return { hold }
}

/** One fixed tick through the live loop, with the cut-follow read its step took. */
function stepTick(
  controller: VehicleController,
  loop: ReturnType<typeof createVehicleLoop>,
  intent: VehicleIntent,
  before: { position: Vector2; world: WorldState },
): TickRead {
  let result: VehicleStepResult | null = null
  let read: CutFollow | undefined
  const energyBefore = readLocalVehicle().energy
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
  const stepResult: VehicleStepResult = result
  const position = controller.planetPosition()
  return {
    result: stepResult,
    read,
    position,
    speed: speedAlongFacing(stepResult.pose, position, before.position),
    opensCell: opensCellAhead(stepResult.pose, position, before.world),
    authorityGate: gateLeftThisTick(),
    isInsideGround: isInsideGround(position),
    isOnGround: isInsideGround(groundProbeOf(position, upOf(stepResult.pose))),
    energySpent: energyBefore - readLocalVehicle().energy,
  }
}

function speedAlongFacing(pose: VehiclePose, after: Vector2, before: Vector2): number {
  const facing = facingVectorOf(pose.upx, pose.upy, pose.facing)
  const along = (after.x - before.x) * facing.x + (after.y - before.y) * facing.y
  return along / UP_VECTOR_SCALE / PHYSICS_TIMESTEP
}

/** A cell on the line ahead of the body's face yielded in the tick (#433's line). */
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

function gateLeftThisTick(): 0 | 1 | null {
  const cursor = readLocalVehicle().sweptCut
  return cursor?.tick === readAuthorityTick() ? cursor.cutGate : null
}

function upOf(pose: VehiclePose): Vector2 {
  return { x: pose.upx / UP_VECTOR_SCALE, y: pose.upy / UP_VECTOR_SCALE }
}

/** The point sits in solid ground as the authority's world stands after the tick. */
function isInsideGround({ x, y }: Vector2): boolean {
  const state = readAuthorityState()
  const params = planetParamsOf(state.planet)
  if (params === null) return false
  return groundReaderOf(state.world, params).densityAtPoint(x, y) >= ISO_DENSITY
}

/**
 * The speed the drill commands on each tick: the open gate's `vCut` through ground to cut, held
 * through a shut gate and a slab the cut has cleared (the coast's and the read's own rule).
 */
export function commandedSpeedsOf(ticks: readonly TickRead[]): number[] {
  let commanded = 0
  return ticks.map(({ result, read }) => {
    if (result.isCutting && read !== undefined && read.isSlabClear !== true && read.cutSpeed > 0) {
      commanded = read.cutSpeed
    }
    return commanded
  })
}
