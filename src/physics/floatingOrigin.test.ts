import RAPIER from '@dimforge/rapier3d-compat'
import { beforeAll, describe, expect, it } from 'vitest'
import { PHYSICS_TIMESTEP } from '../constants/physics'
import { engineStats } from '../systems/economy/vehicleStats'
import { IDLE_INTENT } from '../systems/vehicle/vehicleIntent'
import { FACING } from '../systems/vehicle/vehiclePose'
import type { GroundReader } from '../systems/world/groundReader'
import { ISO_DENSITY, SAMPLES_PER_TILE, SOLID_DENSITY } from '../systems/world/sampleGrid'
import {
  createVehicleBody,
  createVehicleController,
  type PlanetView,
  type VehicleControllerOptions,
} from './vehicleController'

// The physics layer (docs/TESTING_INSTRUCTIONS.md) at planet radii f32 cannot hold to a millimetre
// (ticket 339). One fixture, a stamp-wide shaft bored straight down from a flat surface, is laid
// at 1, 8, 64 and 512 km from the centre; the rig falls onto it from above, drops down the shaft and
// lands on its floor. Because Rapier measures from the floating render origin near the rig, never
// from the planet's centre, every radius gives the same fall and the same landing.

const RADII_KM = [1, 8, 64, 512]
/** Straight down the fixture is toward the centre; both coordinates large, neither on an axis. */
const OUTWARD = { x: 0.6, y: 0.8 }
const ALONG = { x: 0.8, y: -0.6 }
const SHAFT_HALF_WIDTH_M = 0.95
const SHAFT_DEPTH_M = 30
const START_ABOVE_M = 3
const STEPS = 180
/** The ramp's slope across a contour, in density per metre: 255 a sample, like generation. */
const RAMP_PER_METRE = SOLID_DENSITY * SAMPLES_PER_TILE

beforeAll(async () => {
  await RAPIER.init()
})

/**
 * The shaft's mouth, `radiusKm` out along `OUTWARD`: whole 4 m collision blocks for every radius
 * here, so the ground's samples and the halo's walls are the same around it wherever it lies.
 */
function mouthAt(radiusKm: number): { x: number; y: number } {
  return { x: radiusKm * 1000 * OUTWARD.x, y: radiusKm * 1000 * OUTWARD.y }
}

/** Solid below the surface through the mouth, but for the shaft. */
function shaftGround(mouth: { x: number; y: number }): GroundReader {
  const densityAtMetres = (x: number, y: number): number => {
    const [dx, dy] = [x - mouth.x, y - mouth.y]
    const up = dx * OUTWARD.x + dy * OUTWARD.y
    const across = dx * ALONG.x + dy * ALONG.y
    const shaftRock = Math.max(
      rampOf(Math.abs(across) - SHAFT_HALF_WIDTH_M),
      rampOf(-SHAFT_DEPTH_M - up),
    )
    return Math.min(rampOf(-up), shaftRock)
  }
  return {
    densityAt: (sx, sy) => densityAtMetres(sx / SAMPLES_PER_TILE, sy / SAMPLES_PER_TILE),
    densityAtPoint: densityAtMetres,
    materialAt: () => 1,
  }
}

function rampOf(insideM: number): number {
  return Math.max(0, Math.min(SOLID_DENSITY, ISO_DENSITY + insideM * RAMP_PER_METRE))
}

/** Where the rig is every 10 steps, from the mouth: up the shaft and across it, in mm. */
interface Trace {
  places: { upMm: number; acrossMm: number }[]
  origins: Set<string>
}

function dropDownTheShaft(radiusKm: number, options: VehicleControllerOptions = {}): Trace {
  const mouth = mouthAt(radiusKm)
  const ground = shaftGround(mouth)
  const planet: PlanetView = {
    radiusTiles: radiusKm * 1000,
    gravityMultiplier: 1,
    worldVersion: ground,
    ground,
    chunkVersion: () => ground,
  }
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 })
  world.timestep = PHYSICS_TIMESTEP
  const pose = {
    x: Math.round((mouth.x + START_ABOVE_M * OUTWARD.x) * 1000),
    y: Math.round((mouth.y + START_ABOVE_M * OUTWARD.y) * 1000),
    vx: 0,
    vy: 0,
    upx: Math.round(OUTWARD.x * 1024),
    upy: Math.round(OUTWARD.y * 1024),
    facing: FACING.right,
  }
  const placed = createVehicleBody(RAPIER, world, pose)
  const controller = createVehicleController(RAPIER, world, placed, options)
  const trace: Trace = { places: [], origins: new Set() }
  for (let step = 1; step <= STEPS; step++) {
    controller.step({ intent: IDLE_INTENT, engine: engineStats(0), canAct: true }, planet)
    world.step()
    const { xMm, yMm } = controller.renderOrigin()
    trace.origins.add(`${xMm},${yMm}`)
    if (step % 10 === 0) trace.places.push(placeFromMouth(controller.planetPosition(), mouth))
  }
  return trace
}

function placeFromMouth(at: { x: number; y: number }, mouth: { x: number; y: number }) {
  const [dx, dy] = [at.x - mouth.x, at.y - mouth.y]
  return {
    upMm: (dx * OUTWARD.x + dy * OUTWARD.y) * 1000,
    acrossMm: (dx * ALONG.x + dy * ALONG.y) * 1000,
  }
}

function expectSameWithinAMillimetre(trace: Trace, reference: Trace): void {
  trace.places.forEach((place, at) => {
    expect(Math.abs(place.upMm - reference.places[at].upMm)).toBeLessThanOrEqual(1)
    expect(Math.abs(place.acrossMm - reference.places[at].acrossMm)).toBeLessThanOrEqual(1)
  })
}

describe('floating origin physics', () => {
  it('falls, drops down a bored shaft and lands on its floor', () => {
    const { places } = dropDownTheShaft(1)
    const landing = places.at(-1)!
    expect(Math.min(...places.map((place) => place.upMm))).toBeGreaterThan(-SHAFT_DEPTH_M * 1000)
    expect(landing.upMm).toBeCloseTo(-SHAFT_DEPTH_M * 1000 + 450, -1)
    expect(Math.abs(landing.acrossMm)).toBeLessThan(SHAFT_HALF_WIDTH_M * 1000 - 450)
  })

  it('falls and lands the same at 1, 8, 64 and 512 km from the centre, to a millimetre', () => {
    const [reference, ...others] = RADII_KM.map((radiusKm) => dropDownTheShaft(radiusKm))
    for (const trace of others) expectSameWithinAMillimetre(trace, reference)
  })

  it('moves the render origin mid-fall without moving the rig a millimetre', () => {
    for (const radiusKm of RADII_KM) {
      const steady = dropDownTheShaft(radiusKm)
      const moving = dropDownTheShaft(radiusKm, { originReachMm: 0 })
      expect(steady.origins.size).toBe(1)
      expect(moving.origins.size).toBeGreaterThan(1)
      expectSameWithinAMillimetre(moving, steady)
    }
  })
})
