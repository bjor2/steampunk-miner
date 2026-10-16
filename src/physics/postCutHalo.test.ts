import RAPIER from '@dimforge/rapier3d-compat'
import { beforeAll, describe, expect, it } from 'vitest'
import { CUT_FOLLOW_TICKS, STEP_BOUND_TOLERANCE_MM } from '../constants/balance'
import { MM_PER_METRE, PHYSICS_TIMESTEP, VEHICLE_COLLIDER_SIZE } from '../constants/physics'
import { engineStatsAtStep } from '../systems/economy/vehicleStats'
import { buildIntent } from '../systems/input/buildIntent'
import { sweptDrillContactOf } from '../systems/vehicle/drillContact'
import type { Vector2 } from '../systems/vehicle/localFrame'
import { FACING, type VehiclePose } from '../systems/vehicle/vehiclePose'
import { clearDisc } from '../systems/world/groundEdit'
import { groundReaderOf } from '../systems/world/groundReader'
import { planetParamsFor } from '../systems/world/planetParams'
import { ISO_DENSITY } from '../systems/world/sampleGrid'
import { chunkKey } from '../systems/world/tileGrid'
import { EMPTY_WORLD, type WorldState } from '../systems/world/worldState'
import {
  createVehicleBody,
  createVehicleController,
  type PlanetView,
  type VehicleController,
  type VehicleStepInput,
} from './vehicleController'

// The halo on the tick's post-cut world (ticket 459, the TD's trace on #440): the motor's step reads
// the world before the tick's own cut, and the loop then hands it the world that cut left, so the
// substeps collide with that. Here the cut is a level bore, carved each tick on past the body's face
// by the step the drill commands, the way a `drillStep` opens the slab the body is about to drive
// through: the real controller, body and halo, a plain Rapier world in node, no store. Level
// follows the planet's curve, so the bore runs along the arc of the body's radius.

const PARAMS = planetParamsFor(83921, 1)
/** The bore's centre line: its distance from the planet's centre, and where along it the body starts. */
const BORE_RADIUS_M = 279.5
const START_ARC_M = 20
const DISC_RADIUS_MM = 950
const DISC_SPACING_M = 0.25
const CUT_TICKS = 40
const FACE_M = VEHICLE_COLLIDER_SIZE / 2
/** How far the bore's round front stands past the body's face on its centre line after a step. */
const CUT_LEAD_M = 0.25
const SPEEDS = [25, 44, 78]

beforeAll(async () => {
  await RAPIER.init()
})

/** One tick of the cut, read after it. */
interface CutTick {
  /** mm along the bore the body moved over the tick. */
  movedMm: number
  /** Solid ground stood within the commanded step past the face before the tick's cut. */
  hadGroundAhead: boolean
  isInsideGround: boolean
}

/** The point `arcM` along the bore's centre line, rightward from the planet's top. */
function pointOnBore(arcM: number): Vector2 {
  const angle = arcM / BORE_RADIUS_M
  return { x: BORE_RADIUS_M * Math.sin(angle), y: BORE_RADIUS_M * Math.cos(angle) }
}

/** How far along the bore's centre line a point stands. */
function arcOf({ x, y }: Vector2): number {
  return BORE_RADIUS_M * Math.atan2(x, y)
}

/** The bore carved with discs every quarter metre from `fromArcM` to `toArcM` along it. */
function carveBore(world: WorldState, fromArcM: number, toArcM: number): WorldState {
  let carved = world
  for (let arcM = fromArcM; arcM <= toArcM; arcM += DISC_SPACING_M) {
    const centre = pointOnBore(arcM)
    const disc = {
      xMm: Math.round(centre.x * MM_PER_METRE),
      yMm: Math.round(centre.y * MM_PER_METRE),
      radiusMm: DISC_RADIUS_MM,
      floorRadiusMm: null,
    }
    carved = clearDisc(carved, PARAMS, disc, 255).world
  }
  return carved
}

/** The bore carved on until its round front stands at `frontArcM`. */
function carveBoreTo(world: WorldState, fromArcM: number, frontArcM: number): WorldState {
  return carveBore(world, fromArcM, frontArcM - DISC_RADIUS_MM / MM_PER_METRE)
}

function planetViewOf(world: WorldState): PlanetView {
  return {
    radiusTiles: PARAMS.radiusTiles,
    // No weight, so the body rides the bore's centre line and only the face can hold it back.
    gravityMultiplier: 0,
    worldVersion: world,
    ground: groundReaderOf(world, PARAMS),
    chunkVersion: (cx, cy) => world.chunks[chunkKey(cx, cy)],
  }
}

function isSolidAt(world: WorldState, { x, y }: Vector2): boolean {
  return groundReaderOf(world, PARAMS).densityAtPoint(x, y) >= ISO_DENSITY
}

/** A drill cutting right at `speed` behind an open gate, its bound one step and the tolerance. */
function cutInputOf(speed: number): VehicleStepInput {
  const boundMm = Math.round(speed * PHYSICS_TIMESTEP * MM_PER_METRE) + STEP_BOUND_TOLERANCE_MM
  return {
    intent: buildIntent(['aim_right']),
    engine: engineStatsAtStep(0),
    canAct: true,
    drillContactRule: sweptDrillContactOf,
    cutFollowOf: () => ({ gate: { cutGate: 1, cutGateLowTicks: 0 }, cutSpeed: speed }),
    stepBounds: { cuttingMm: boundMm, travellingMm: boundMm },
  }
}

/** Whether ground stands on the bore's centre line within `stepM` past the face at `arcM`. */
function hasGroundAhead(world: WorldState, arcM: number, stepM: number): boolean {
  const samples = Math.ceil(stepM / (DISC_SPACING_M / 2))
  return Array.from({ length: samples }, (_, at) => (at + 1) / samples).some((share) =>
    isSolidAt(world, pointOnBore(arcM + FACE_M + share * stepM)),
  )
}

/**
 * One tick as the swept loop runs it: the step on the world before the cut; the cut, the bore's
 * front carried `CUT_LEAD_M` past the face moved on by the commanded step; then the substeps.
 */
function stepCutTick(
  controller: VehicleController,
  world: WorldState,
  speed: number,
): { world: WorldState; tick: CutTick } {
  const before = arcOf(controller.planetPosition())
  const stepM = speed * PHYSICS_TIMESTEP
  controller.step(cutInputOf(speed), planetViewOf(world))
  const cut = carveBoreTo(world, before, before + FACE_M + stepM + CUT_LEAD_M)
  controller.syncGround(planetViewOf(cut))
  controller.stepWorld()
  const after = controller.planetPosition()
  return {
    world: cut,
    tick: {
      movedMm: (arcOf(after) - before) * MM_PER_METRE,
      hadGroundAhead: hasGroundAhead(world, before, stepM),
      isInsideGround: isSolidAt(cut, after),
    },
  }
}

/** A body on the centre line of a short bore, cutting right along it at `speed`. */
function cutLevelBore(speed: number): CutTick[] {
  const rapierWorld = new RAPIER.World({ x: 0, y: 0, z: 0 })
  const start = pointOnBore(START_ARC_M)
  const pose: VehiclePose = {
    x: Math.round(start.x * MM_PER_METRE),
    y: Math.round(start.y * MM_PER_METRE),
    vx: 0,
    vy: 0,
    upx: 0,
    upy: 1024,
    facing: FACING.right,
  }
  const controller = createVehicleController(
    RAPIER,
    rapierWorld,
    createVehicleBody(RAPIER, rapierWorld, pose),
  )
  let world = carveBoreTo(EMPTY_WORLD, START_ARC_M - 4, START_ARC_M + FACE_M + CUT_LEAD_M)
  const ticks: CutTick[] = []
  for (let tick = 0; tick < CUT_TICKS; tick++) {
    const stepped = stepCutTick(controller, world, speed)
    world = stepped.world
    ticks.push(stepped.tick)
  }
  controller.dispose()
  rapierWorld.free()
  return ticks
}

/** The ticks after the cut-follow's start ramp, which hold `vCut` outright (ticket 400). */
function heldTicksOf(ticks: readonly CutTick[]): CutTick[] {
  return ticks.slice(CUT_FOLLOW_TICKS + 1)
}

describe('the collider halo on the tick post-cut world (ticket 459)', () => {
  it.each(SPEEDS)('at %d m/s each held step drives into ground the tick cut opens', (speed) => {
    expect(heldTicksOf(cutLevelBore(speed)).filter((tick) => !tick.hadGroundAhead)).toEqual([])
  })

  it.each(SPEEDS)(
    'at %d m/s a body commanded through ground its own tick cut opened moves its full step',
    (speed) => {
      const stepMm = speed * PHYSICS_TIMESTEP * MM_PER_METRE
      const short = heldTicksOf(cutLevelBore(speed)).filter(
        (tick) => Math.abs(tick.movedMm - stepMm) > 1,
      )
      expect(short).toEqual([])
    },
  )

  it.each(SPEEDS)('at %d m/s the body never ends a tick inside ground', (speed) => {
    expect(cutLevelBore(speed).filter((tick) => tick.isInsideGround)).toEqual([])
  })
})
