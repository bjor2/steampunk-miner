import RAPIER from '@dimforge/rapier3d-compat'
import { beforeAll, describe, expect, it } from 'vitest'
import { PHYSICS_TIMESTEP } from '../constants/physics'
import { engineStats } from '../systems/economy/vehicleStats'
import { IDLE_INTENT, type VehicleIntent } from '../systems/vehicle/vehicleIntent'
import { FACING } from '../systems/vehicle/vehiclePose'
import { planetParamsFor } from '../systems/world/planetParams'
import { surfaceRowOfColumn, type TilePoint } from '../systems/world/tileGrid'
import { isSolidCell } from '../systems/world/worldCell'
import { cellAt, EMPTY_WORLD, withTileRemoved, type WorldState } from '../systems/world/worldState'
import { createVehicleBody, createVehicleController } from './vehicleController'

// The physics layer (docs/TESTING_INSTRUCTIONS.md): a real Rapier world in node, no React and no
// canvas, driven through the same controller the game uses.

const PARAMS = planetParamsFor(83921, 1)
const COLUMN = 20
const SURFACE: TilePoint = { tx: COLUMN, ty: surfaceRowOfColumn(COLUMN, PARAMS.radiusTiles) }

beforeAll(async () => {
  await RAPIER.init()
})

/** The tile grid is symmetric under a quarter turn clockwise: (tx, ty) -> (ty, -tx - 1). */
function quarterTurns(tile: TilePoint, turns: number): TilePoint {
  let turned = tile
  for (let turn = 0; turn < turns; turn++) turned = { tx: turned.ty, ty: -turned.tx - 1 }
  return turned
}

/** A tile `along` tiles right of the column and `depth` tiles below the surface, at an angle. */
function localTile(turns: number, along: number, depth: number): TilePoint {
  return quarterTurns({ tx: SURFACE.tx + along, ty: SURFACE.ty - depth }, turns)
}

function centreOf(tile: TilePoint): { x: number; y: number } {
  return { x: tile.tx + 0.5, y: tile.ty + 0.5 }
}

function createHarness(world: WorldState, start: { x: number; y: number }) {
  const rapierWorld = new RAPIER.World({ x: 0, y: 0, z: 0 })
  rapierWorld.timestep = PHYSICS_TIMESTEP
  const pose = {
    x: start.x * 1000,
    y: start.y * 1000,
    vx: 0,
    vy: 0,
    upx: 0,
    upy: 1024,
    facing: FACING.right,
  }
  const body = createVehicleBody(RAPIER, rapierWorld, pose)
  const controller = createVehicleController(RAPIER, rapierWorld, body)
  const planet = {
    radiusTiles: PARAMS.radiusTiles,
    gravityMultiplier: 1,
    worldVersion: world,
    cellAt: (tile: TilePoint) => cellAt(world, PARAMS, tile),
  }
  const insideSolid: TilePoint[] = []
  return {
    body,
    run(intent: VehicleIntent, steps: number) {
      for (let step = 0; step < steps; step++) {
        controller.step({ intent, engine: engineStats(0), canAct: true }, planet)
        rapierWorld.step()
        const tile = tileOfBody()
        if (isSolidCell(planet.cellAt(tile))) insideSolid.push(tile)
      }
    },
    tile: tileOfBody,
    insideSolid,
  }

  function tileOfBody(): TilePoint {
    const { x, y } = body.translation()
    return { tx: Math.floor(x), ty: Math.floor(y) }
  }
}

function withBore(tiles: readonly TilePoint[]): WorldState {
  return tiles.reduce(withTileRemoved, EMPTY_WORLD)
}

const ANGLES = [0, 1, 2, 3]
const LIFT: VehicleIntent = { ...IDLE_INTENT, lift: true }

describe('vehicle physics', () => {
  it.each(ANGLES)('never tunnels through intact tiles at 16 m/s (quarter turn %i)', (turns) => {
    const surface = centreOf(localTile(turns, 0, 0))
    const radius = Math.sqrt(surface.x * surface.x + surface.y * surface.y)
    const up = { x: surface.x / radius, y: surface.y / radius }
    const harness = createHarness(EMPTY_WORLD, { x: surface.x + 4 * up.x, y: surface.y + 4 * up.y })
    harness.body.setLinvel({ x: -16 * up.x, y: -16 * up.y, z: 0 }, true)
    harness.run(IDLE_INTENT, 180)
    expect(harness.insideSolid).toEqual([])
    const { x, y } = harness.body.translation()
    expect(Math.sqrt(x * x + y * y)).toBeGreaterThan(radius)
  })

  it.each(ANGLES)('enters, drives along and leaves a 1-tile bore (quarter turn %i)', (turns) => {
    const shaft = [0, 1, 2, 3, 4, 5, 6, 7].map((depth) => localTile(turns, 0, depth))
    const tunnel = [1, 2, 3, 4, 5].map((along) => localTile(turns, along, 7))
    const mouth = centreOf(localTile(turns, 0, -1))
    const harness = createHarness(withBore([...shaft, ...tunnel]), mouth)

    harness.run(IDLE_INTENT, 240)
    expect(harness.tile()).toEqual(localTile(turns, 0, 7))

    harness.run({ moveX: 1, facing: FACING.right, lift: false }, 120)
    expect(harness.tile()).toEqual(localTile(turns, 5, 7))

    harness.run({ moveX: -1, facing: FACING.left, lift: false }, 120)
    expect(harness.tile()).toEqual(localTile(turns, 0, 7))

    harness.run(LIFT, 150)
    const out = localTile(turns, 0, -1)
    const { x, y } = harness.body.translation()
    const outCentre = centreOf(out)
    expect(Math.sqrt(x * x + y * y)).toBeGreaterThan(
      Math.sqrt(outCentre.x ** 2 + outCentre.y ** 2) - 0.5,
    )
    expect(harness.insideSolid).toEqual([])
  })
})
