import RAPIER from '@dimforge/rapier3d-compat'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { PHYSICS_TIMESTEP } from '../constants/physics'
import { createDebugApi } from '../debug/debugApi'
import { engineStats } from '../systems/economy/vehicleStats'
import { IDLE_INTENT } from '../systems/vehicle/vehicleIntent'
import { FACING } from '../systems/vehicle/vehiclePose'
import { groundReaderOf } from '../systems/world/groundReader'
import { planetParamsFor } from '../systems/world/planetParams'
import { chunkKey, surfaceRowOfColumn } from '../systems/world/tileGrid'
import { EMPTY_WORLD } from '../systems/world/worldState'
import { watchPhysicsWorld } from './physicsStats'
import { watchRapierWasmMemory } from './rapierWasmMemory'
import { createVehicleBody, createVehicleController } from './vehicleController'

// The physics layer (docs/TESTING_INSTRUCTIONS.md): a real Rapier world in node, read through the
// debug API's `getPhysicsStats()` (#119). Rapier loads after the watch, as in a debug run.

const PARAMS = planetParamsFor(83921, 1)
const WASM_PAGE_BYTES = 65536
const COLUMN = 20

beforeAll(async () => {
  watchRapierWasmMemory()
  await RAPIER.init()
})

let unwatch = () => {}
afterEach(() => unwatch())

function createWorld(): RAPIER.World {
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 })
  world.timestep = PHYSICS_TIMESTEP
  unwatch = watchPhysicsWorld(world)
  return world
}

/** The vehicle a metre above the surface of planet 1, settling onto it for `steps` steps. */
function settleVehicleOnSurface(world: RAPIER.World, steps: number) {
  const surfaceRow = surfaceRowOfColumn(COLUMN, PARAMS.radiusTiles)
  const pose = {
    x: (COLUMN + 0.5) * 1000,
    y: (surfaceRow + 2) * 1000,
    vx: 0,
    vy: 0,
    upx: 0,
    upy: 1024,
    facing: FACING.right,
  }
  const body = createVehicleBody(RAPIER, world, pose)
  const controller = createVehicleController(RAPIER, world, body)
  const planet = {
    radiusTiles: PARAMS.radiusTiles,
    gravityMultiplier: 1,
    worldVersion: EMPTY_WORLD,
    ground: groundReaderOf(EMPTY_WORLD, PARAMS),
    chunkVersion: (cx: number, cy: number) => EMPTY_WORLD.chunks[chunkKey(cx, cy)],
  }
  for (let step = 0; step < steps; step++) {
    controller.step({ intent: IDLE_INTENT, engine: engineStats(0), canAct: true }, planet)
    world.step()
  }
  return { body, controller }
}

describe('debug api: physics stats (#119)', () => {
  it('refuses with a problem while no physics world is running', () => {
    expect(createDebugApi().getPhysicsStats()).toEqual({
      ok: false,
      problems: ['no physics world is running'],
    })
  })

  it('counts the vehicle and the ground colliders streamed in round it, and none once removed', () => {
    const world = createWorld()
    const debug = createDebugApi()
    expect(debug.getPhysicsStats()).toMatchObject({ ok: true, rigidBodies: 0, colliders: 0 })
    const { body, controller } = settleVehicleOnSurface(world, 60)
    // The vehicle's collider and the three ground blocks the halo built under it.
    expect(debug.getPhysicsStats()).toMatchObject({ ok: true, rigidBodies: 1, colliders: 4 })
    controller.dispose()
    world.removeRigidBody(body)
    expect(debug.getPhysicsStats()).toMatchObject({ ok: true, rigidBodies: 0, colliders: 0 })
  })

  it("reads Rapier's WASM memory in whole pages as it is now, so it grows as the world fills", () => {
    const world = createWorld()
    const debug = createDebugApi()
    const before = debug.getPhysicsStats()
    for (let at = 0; at < 20000; at++)
      world.createCollider(RAPIER.ColliderDesc.ball(0.5).setTranslation(at, 0, 0))
    const after = debug.getPhysicsStats()
    if (!before.ok || !after.ok) throw new Error('physics stats refused')
    expect(before.wasmBytes % WASM_PAGE_BYTES).toBe(0)
    expect(after.wasmBytes % WASM_PAGE_BYTES).toBe(0)
    expect(after.wasmBytes).toBeGreaterThan(before.wasmBytes)
    expect(after.colliders).toBe(20000)
  })
})
