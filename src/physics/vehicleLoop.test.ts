import RAPIER from '@dimforge/rapier3d-compat'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { SWIVEL_TICKS } from '../constants/balance'
import { PHYSICS_TIMESTEP } from '../constants/physics'
import { MAX_GROUND_COLLIDERS } from '../constants/scene'
import { createMemorySink, type MemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import {
  createVehicleBody,
  createVehicleController,
  type VehicleControllerOptions,
} from './vehicleController'
import { readLocalVehicle, readPlanetWorld, resetGameStore } from '../store/gameStore'
import { buildIntent } from '../systems/input/buildIntent'
import { IDLE_INTENT, type VehicleIntent } from '../systems/vehicle/vehicleIntent'
import { FACING } from '../systems/vehicle/vehiclePose'
import { ENERGY_QUANTA_PER_TICK } from '../systems/vehicle/energyQuanta'
import { surfaceRowOfColumn } from '../systems/world/tileGrid'
import { createVehicleLoop } from '../scene/vehicleLoop'

// The fixed-step loop end to end, in the physics layer's terms (docs/TESTING_INSTRUCTIONS.md):
// the real store and authority, a plain Rapier world in node, no React and no canvas.

let sink: MemorySink

beforeAll(async () => {
  await RAPIER.init()
})

beforeEach(() => {
  resetGameStore()
  sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'run_test', sink, secondsSinceStart: () => 0 }))
})

afterEach(() => uninstallRunLog())

function createLiveVehicle(options: VehicleControllerOptions = {}) {
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 })
  world.timestep = PHYSICS_TIMESTEP
  const start = readLocalVehicle().pose
  if (start === null) throw new Error('the starting planet has no dock')
  const placed = createVehicleBody(RAPIER, world, start)
  const controller = createVehicleController(RAPIER, world, placed, options)
  const loop = createVehicleLoop()
  const origins = new Set<string>()
  return {
    controller,
    origins,
    hold(intent: VehicleIntent, seconds: number) {
      for (let step = 0; step < seconds / PHYSICS_TIMESTEP; step++) {
        loop.step(controller, intent)
        world.step()
        const { xMm, yMm } = controller.renderOrigin()
        origins.add(`${xMm},${yMm}`)
      }
    },
  }
}

/** A fresh store and run log, for a second run in the same test. */
function restartRun(): void {
  uninstallRunLog()
  resetGameStore()
  sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'run_test', sink, secondsSinceStart: () => 0 }))
}

const lastPose = () => {
  const poses = sink.commands.filter((command) => command.type === 'reportPose')
  return poses.at(-1)?.payload as { thrusting: boolean; facing: number }
}

const destroyedTiles = () => sink.events.filter((event) => event.event === 'tile_destroyed')

describe('vehicle loop', () => {
  it('drives off the pad and digs straight down, charging energy through pose reports', () => {
    const vehicle = createLiveVehicle()
    vehicle.hold(IDLE_INTENT, 0.5)
    // The Sell bay is the pad's west end (#170), so off the pad is to the left.
    vehicle.hold(buildIntent(['aim_left']), 2)
    vehicle.hold(buildIntent(['aim_down']), 5)
    const { x, y } = vehicle.controller.planetPosition()
    const { params } = readPlanetWorld()
    expect(destroyedTiles().length).toBeGreaterThanOrEqual(3)
    expect(Math.floor(y)).toBeLessThan(surfaceRowOfColumn(Math.floor(x), params?.radiusTiles ?? 0))
    expect(readLocalVehicle().energy).toBeLessThan(150 * 240)
    expect(sink.commands.every((command) => command.type === 'reportPose')).toBe(true)
  })

  it('drills a level tunnel sideways from the bottom of its shaft, along the planet curve', () => {
    const vehicle = createLiveVehicle()
    vehicle.hold(buildIntent(['aim_right']), 2)
    vehicle.hold(buildIntent(['aim_down']), 6)
    vehicle.hold(IDLE_INTENT, 0.5)
    const start = vehicle.controller.planetPosition()
    const startRadius = Math.hypot(start.x, start.y)
    const radii: number[] = []
    for (let second = 0; second < 12; second++) {
      vehicle.hold(buildIntent(['aim_right']), 1)
      const { x, y } = vehicle.controller.planetPosition()
      radii.push(Math.hypot(x, y))
    }
    expect(vehicle.controller.planetPosition().x - start.x).toBeGreaterThan(8)
    expect(vehicle.controller.colliderCount()).toBeGreaterThan(0)
    expect(vehicle.controller.colliderCount()).toBeLessThanOrEqual(MAX_GROUND_COLLIDERS)
    for (const radius of radii) expect(Math.abs(radius - startRadius)).toBeLessThan(0.4)
  })

  it('climbs back out of its shaft on the lift', () => {
    const vehicle = createLiveVehicle()
    vehicle.hold(buildIntent(['aim_right']), 2)
    vehicle.hold(buildIntent(['aim_down']), 4)
    const bottom = vehicle.controller.planetPosition().y
    vehicle.hold({ ...IDLE_INTENT, lift: true }, 1.5)
    expect(vehicle.controller.planetPosition().y).toBeGreaterThan(bottom + 3)
  })

  it('climbs on W alone, and S pressed after W stops the thrust at the next pose report (#40)', () => {
    const vehicle = createLiveVehicle()
    vehicle.hold(buildIntent(['aim_right']), 2)
    vehicle.hold(buildIntent(['aim_down']), 4)
    const bottom = vehicle.controller.planetPosition().y
    vehicle.hold(buildIntent(['lift']), 1.5)
    expect(vehicle.controller.planetPosition().y).toBeGreaterThan(bottom + 3)
    expect(lastPose()).toMatchObject({ thrusting: true, facing: FACING.up })
    vehicle.hold(buildIntent(['lift', 'aim_down']), 0.25)
    expect(lastPose().thrusting).toBe(false)
  })

  it('costs at most SWIVEL_TICKS ticks of thrust for a W tap that only turns the head up', () => {
    const vehicle = createLiveVehicle()
    vehicle.hold(IDLE_INTENT, 0.5)
    const before = readLocalVehicle().energy
    vehicle.hold(buildIntent(['lift']), SWIVEL_TICKS * PHYSICS_TIMESTEP)
    vehicle.hold(IDLE_INTENT, 1)
    const spent = before - readLocalVehicle().energy
    expect(spent).toBeGreaterThan(0)
    expect(spent).toBeLessThanOrEqual(SWIVEL_TICKS * ENERGY_QUANTA_PER_TICK.thrust)
  })

  it('drills on through a moved render origin as if it had never moved (ticket 339)', () => {
    const digAndTunnel = (options: VehicleControllerOptions) => {
      restartRun()
      const vehicle = createLiveVehicle(options)
      vehicle.hold(buildIntent(['aim_left']), 2)
      vehicle.hold(buildIntent(['aim_down']), 5)
      vehicle.hold(buildIntent(['aim_left']), 4)
      const tiles = destroyedTiles().map((event) => JSON.stringify(event.data))
      return { tiles, at: vehicle.controller.planetPosition(), origins: vehicle.origins }
    }
    const steady = digAndTunnel({})
    const moving = digAndTunnel({ originReachMm: 0 })
    expect(steady.origins.size).toBe(1)
    expect(moving.origins.size).toBeGreaterThan(1)
    expect(steady.tiles.length).toBeGreaterThan(10)
    expect(moving.tiles).toEqual(steady.tiles)
    expect(Math.abs(moving.at.x - steady.at.x)).toBeLessThanOrEqual(0.001)
    expect(Math.abs(moving.at.y - steady.at.y)).toBeLessThanOrEqual(0.001)
  })
})
