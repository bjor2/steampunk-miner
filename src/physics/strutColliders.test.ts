import RAPIER from '@dimforge/rapier3d-compat'
import { beforeAll, describe, expect, it } from 'vitest'
import { PHYSICS_TIMESTEP, VEHICLE_COLLIDER_SIZE } from '../constants/physics'
import type { BoreStrut, StandingStruts } from '../systems/authority/bore/strutState'
import { engineStats } from '../systems/economy/vehicleStats'
import { IDLE_INTENT, type VehicleIntent } from '../systems/vehicle/vehicleIntent'
import { FACING } from '../systems/vehicle/vehiclePose'
import { strutPlankOf } from '../systems/vehicle/strutPlank'
import { clearDisc } from '../systems/world/groundEdit'
import { groundReaderOf } from '../systems/world/groundReader'
import { planetParamsFor } from '../systems/world/planetParams'
import { chunkKey, surfaceRowOfColumn } from '../systems/world/tileGrid'
import { EMPTY_WORLD, type WorldState } from '../systems/world/worldState'
import { createVehicleBody, createVehicleController } from './vehicleController'

// The physics layer (docs/TESTING_INSTRUCTIONS.md): a real Rapier world in node, no React and no
// canvas, driven through the same controller the game uses.

const PARAMS = planetParamsFor(83921, 1)
const COLUMN = 20
/** A cavern's middle 20 m under the surface, a strut wedged there over a hole going down. */
const MOUTH = { tx: COLUMN, ty: surfaceRowOfColumn(COLUMN, PARAMS.radiusTiles) - 20 }
const STRUT: BoreStrut = {
  playerId: 'p1',
  ...MOUTH,
  pocketTx: MOUTH.tx,
  pocketTy: MOUTH.ty - 1,
  placedTick: 0,
  untilTick: 600,
}
const STANDING: StandingStruts = { [`${MOUTH.tx},${MOUTH.ty}`]: STRUT }
const NONE: StandingStruts = {}
const PLANK = strutPlankOf(STRUT)
/** How far from the planet's centre the plank's top lies. */
const PLANK_TOP = radiusOf({
  x: PLANK.centre.x + PLANK.up.x * PLANK.halfThickness,
  y: PLANK.centre.y + PLANK.up.y * PLANK.halfThickness,
})
const DRIVE_RIGHT: VehicleIntent = { ...IDLE_INTENT, moveX: 1, facing: FACING.right }

beforeAll(async () => {
  await RAPIER.init()
})

function radiusOf({ x, y }: { x: number; y: number }): number {
  return Math.sqrt(x * x + y * y)
}

/** Open air 6 m round the mouth: nothing but the plank to stand on. */
function cavern(): WorldState {
  const centre = { xMm: (MOUTH.tx + 0.5) * 1000, yMm: (MOUTH.ty + 0.5) * 1000 }
  return clearDisc(EMPTY_WORLD, PARAMS, { ...centre, radiusMm: 6000, floorRadiusMm: null }, 255)
    .world
}

/** The rig 2 m above the plank's middle, upright, still. */
function createHarness(world: WorldState) {
  const rapierWorld = new RAPIER.World({ x: 0, y: 0, z: 0 })
  rapierWorld.timestep = PHYSICS_TIMESTEP
  const start = { x: PLANK.centre.x + PLANK.up.x * 2, y: PLANK.centre.y + PLANK.up.y * 2 }
  const pose = { x: start.x * 1000, y: start.y * 1000, vx: 0, vy: 0, upx: 0, upy: 1024 }
  const placed = createVehicleBody(RAPIER, rapierWorld, { ...pose, facing: FACING.right })
  const controller = createVehicleController(RAPIER, rapierWorld, placed)
  const planet = {
    radiusTiles: PARAMS.radiusTiles,
    gravityMultiplier: 1,
    worldVersion: world,
    ground: groundReaderOf(world, PARAMS),
    chunkVersion: (cx: number, cy: number) => world.chunks[chunkKey(cx, cy)],
  }
  return {
    position: () => controller.planetPosition(),
    run(intent: VehicleIntent, struts: StandingStruts, steps: number) {
      for (let step = 0; step < steps; step++) {
        controller.step({ intent, engine: engineStats(0), canAct: true, struts }, planet)
        controller.stepWorld()
      }
    },
  }
}

/** The body's centre above the plank's top, along the plank's up. */
function heightAbovePlank(position: { x: number; y: number }): number {
  return radiusOf(position) - PLANK_TOP
}

describe('strut colliders (ticket 379)', () => {
  it("lands the rig on a standing strut's plank and holds it there", () => {
    const harness = createHarness(cavern())
    harness.run(IDLE_INTENT, STANDING, 180)
    expect(heightAbovePlank(harness.position())).toBeCloseTo(VEHICLE_COLLIDER_SIZE / 2, 1)
  })

  it('lets the rig fall past where the plank was once the strut has fallen', () => {
    const harness = createHarness(cavern())
    harness.run(IDLE_INTENT, STANDING, 180)
    harness.run(IDLE_INTENT, NONE, 60)
    expect(heightAbovePlank(harness.position())).toBeLessThan(-1)
  })

  it('has no plank at all where no strut stands', () => {
    const harness = createHarness(cavern())
    harness.run(IDLE_INTENT, NONE, 90)
    expect(heightAbovePlank(harness.position())).toBeLessThan(-1)
  })

  it('drives along the plank: its wheels take the strut for ground', () => {
    const harness = createHarness(cavern())
    harness.run(IDLE_INTENT, STANDING, 180)
    const before = harness.position()
    harness.run(DRIVE_RIGHT, STANDING, 15)
    const after = harness.position()
    const along = (after.x - before.x) * PLANK.along.x + (after.y - before.y) * PLANK.along.y
    expect(along).toBeGreaterThan(0.05)
    expect(heightAbovePlank(after)).toBeCloseTo(VEHICLE_COLLIDER_SIZE / 2, 1)
  })
})
