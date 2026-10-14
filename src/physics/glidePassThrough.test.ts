import RAPIER from '@dimforge/rapier3d-compat'
import { beforeAll, describe, expect, it } from 'vitest'
import { MM_PER_METRE, PHYSICS_TIMESTEP } from '../constants/physics'
import { ECONOMY } from '../systems/economy/economy'
import { engineStats } from '../systems/economy/vehicleStats'
import { foldMotionEffects } from '../systems/vehicle/motionEffects'
import type { MotionGlide } from '../systems/vehicle/motionGlide'
import { IDLE_INTENT, type VehicleIntent } from '../systems/vehicle/vehicleIntent'
import { FACING } from '../systems/vehicle/vehiclePose'
import { clearDisc, fillDisc } from '../systems/world/groundEdit'
import { groundReaderOf } from '../systems/world/groundReader'
import { planetParamsFor } from '../systems/world/planetParams'
import { ISO_DENSITY, SAMPLES_PER_TILE, SOLID_DENSITY } from '../systems/world/sampleGrid'
import { chunkKey, surfaceRowOfColumn, type TilePoint } from '../systems/world/tileGrid'
import { EMPTY_WORLD, type WorldState } from '../systems/world/worldState'
import { createVehicleBody, createVehicleController } from './vehicleController'

// The physics layer (docs/TESTING_INSTRUCTIONS.md): a real Rapier world in node, no React and no
// canvas, driven through the same controller the game uses. A glide (ticket 390, the phase move of
// #261) carries the body through one solid cell's ground into the open cell beyond and rests it
// there; every other wall stands, and once the glide ends the body is in open air.

const PARAMS = planetParamsFor(83921, 1)
const COLUMN = 20
/** The solid cell the glide passes through, 20 m under the surface; open above and below it. */
const PHASED: TilePoint = {
  tx: COLUMN,
  ty: surfaceRowOfColumn(COLUMN, PARAMS.radiusTiles) - 20,
}
const START: TilePoint = { tx: PHASED.tx, ty: PHASED.ty + 1 }
const LANDING: TilePoint = { tx: PHASED.tx, ty: PHASED.ty - 1 }
const GLIDE_TICKS = 24
const AFTER_TICKS = 30
const CAP_BP = ECONOMY.itemEffectCaps.motionBoostCapBp
const DRILL_DOWN: VehicleIntent = { ...IDLE_INTENT, facing: FACING.down }
/** A fill this small raises only the sample it is centred on. */
const ONE_SAMPLE_MM = 100

beforeAll(async () => {
  await RAPIER.init()
})

function centreOf(tile: TilePoint): { x: number; y: number } {
  return { x: tile.tx + 0.5, y: tile.ty + 0.5 }
}

/** A cavern 6 m round the phased cell, with that one cell's 16 samples solid again. */
function cavernWithPhasedCell(): WorldState {
  const centre = centreOf(PHASED)
  const open = { xMm: centre.x * MM_PER_METRE, yMm: centre.y * MM_PER_METRE }
  let world = clearDisc(
    EMPTY_WORLD,
    PARAMS,
    { ...open, radiusMm: 6000, floorRadiusMm: null },
    255,
  ).world
  for (const sample of samplesOfCell(PHASED)) {
    const disc = { ...sample, radiusMm: ONE_SAMPLE_MM, floorRadiusMm: null }
    world = fillDisc(world, PARAMS, disc, SOLID_DENSITY).world
  }
  return world
}

function samplesOfCell(tile: TilePoint): { xMm: number; yMm: number }[] {
  const mmPerSample = MM_PER_METRE / SAMPLES_PER_TILE
  const samples: { xMm: number; yMm: number }[] = []
  for (let dy = 0; dy < SAMPLES_PER_TILE; dy++) {
    for (let dx = 0; dx < SAMPLES_PER_TILE; dx++) {
      samples.push({
        xMm: tile.tx * MM_PER_METRE + dx * mmPerSample,
        yMm: tile.ty * MM_PER_METRE + dy * mmPerSample,
      })
    }
  }
  return samples
}

/** The rig still at the start cell's centre, facing down at the phased cell. */
function createHarness(world: WorldState) {
  const rapierWorld = new RAPIER.World({ x: 0, y: 0, z: 0 })
  rapierWorld.timestep = PHYSICS_TIMESTEP
  const start = centreOf(START)
  const pose = {
    x: start.x * MM_PER_METRE,
    y: start.y * MM_PER_METRE,
    vx: 0,
    vy: 0,
    upx: 0,
    upy: 1024,
    facing: FACING.down,
  }
  const placed = createVehicleBody(RAPIER, rapierWorld, pose)
  const controller = createVehicleController(RAPIER, rapierWorld, placed)
  const ground = groundReaderOf(world, PARAMS)
  const planet = {
    radiusTiles: PARAMS.radiusTiles,
    gravityMultiplier: 1,
    worldVersion: world,
    ground,
    chunkVersion: (cx: number, cy: number) => world.chunks[chunkKey(cx, cy)],
  }
  let tick = 0
  return {
    body: placed.body,
    position: () => controller.planetPosition(),
    isInSolidGround: () => {
      const { x, y } = controller.planetPosition()
      return ground.densityAtPoint(x, y) >= ISO_DENSITY
    },
    /** `steps` fixed steps under `glide` (none when null); whether the drill bit on each. */
    run(intent: VehicleIntent, glide: MotionGlide | null, steps: number): boolean[] {
      const drilled: boolean[] = []
      for (let step = 0; step < steps; step++, tick++) {
        const motion = glide === null ? undefined : foldMotionEffects([{ glide }], tick, CAP_BP)
        const result = controller.step(
          { intent, engine: engineStats(0), canAct: true, motion },
          planet,
        )
        controller.stepWorld()
        drilled.push(result.flags.isDrilling)
      }
      return drilled
    },
  }
}

const THROUGH: MotionGlide = { to: LANDING, untilTick: GLIDE_TICKS, passThrough: PHASED }

describe('glide pass-through (ticket 390)', () => {
  it('carries the body through the phased cell and rests it at the landing centre', () => {
    const harness = createHarness(cavernWithPhasedCell())
    harness.run(IDLE_INTENT, THROUGH, GLIDE_TICKS)
    const landing = centreOf(LANDING)
    expect(harness.position().x).toBeCloseTo(landing.x, 3)
    expect(harness.position().y).toBeCloseTo(landing.y, 3)
    const { x, y } = harness.body.linvel()
    expect(Math.hypot(x, y)).toBeCloseTo(0, 3)
  })

  it('stops on the cell’s ground halfway when the same glide passes through nothing', () => {
    const through = createHarness(cavernWithPhasedCell())
    through.run(IDLE_INTENT, THROUGH, GLIDE_TICKS / 2)
    expect(through.position().y).toBeLessThan(PHASED.ty + 1)
    const blocked = createHarness(cavernWithPhasedCell())
    blocked.run(IDLE_INTENT, { ...THROUGH, passThrough: null }, GLIDE_TICKS / 2)
    expect(blocked.position().y).toBeGreaterThan(PHASED.ty + 1.25)
  })

  it('locks the input: a drill held down at the cell never bites while it glides', () => {
    const plain = createHarness(cavernWithPhasedCell())
    expect(plain.run(DRILL_DOWN, null, GLIDE_TICKS)).toContain(true)
    const gliding = createHarness(cavernWithPhasedCell())
    expect(gliding.run(DRILL_DOWN, THROUGH, GLIDE_TICKS)).not.toContain(true)
  })

  it('leaves the body in open air once the glide ends and the cell’s walls stand again', () => {
    const harness = createHarness(cavernWithPhasedCell())
    harness.run(IDLE_INTENT, THROUGH, GLIDE_TICKS)
    for (let step = 0; step < AFTER_TICKS; step++) {
      harness.run(IDLE_INTENT, null, 1)
      expect(harness.isInSolidGround(), `step ${step} after the glide`).toBe(false)
    }
    expect(harness.position().y).toBeLessThan(PHASED.ty)
  })
})
