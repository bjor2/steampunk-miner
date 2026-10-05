import RAPIER from '@dimforge/rapier3d-compat'
import { beforeAll, describe, expect, it } from 'vitest'
import { PHYSICS_TIMESTEP } from '../constants/physics'
import { engineStats } from '../systems/economy/vehicleStats'
import { IDLE_INTENT, type VehicleIntent } from '../systems/vehicle/vehicleIntent'
import { FACING } from '../systems/vehicle/vehiclePose'
import { planetParamsFor } from '../systems/world/planetParams'
import { clearDisc } from '../systems/world/groundEdit'
import { groundReaderOf } from '../systems/world/groundReader'
import { ISO_DENSITY } from '../systems/world/sampleGrid'
import { chunkKey, surfaceRowOfColumn, type TilePoint } from '../systems/world/tileGrid'
import { EMPTY_WORLD, type WorldState } from '../systems/world/worldState'
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

/** The same quarter turn for a point in metres: (x, y) -> (y, -x). */
function turnPoint(point: { x: number; y: number }, turns: number): { x: number; y: number } {
  let turned = point
  for (let turn = 0; turn < turns; turn++) turned = { x: turned.y, y: -turned.x }
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
  const ground = groundReaderOf(world, PARAMS)
  const planet = {
    radiusTiles: PARAMS.radiusTiles,
    gravityMultiplier: 1,
    worldVersion: world,
    ground,
    chunkVersion: (cx: number, cy: number) => world.chunks[chunkKey(cx, cy)],
  }
  const insideSolid: { x: number; y: number }[] = []
  return {
    body,
    run(intent: VehicleIntent, steps: number) {
      for (let step = 0; step < steps; step++) {
        controller.step({ intent, engine: engineStats(0), canAct: true }, planet)
        rapierWorld.step()
        const { x, y } = body.translation()
        if (ground.densityAtPoint(x, y) >= ISO_DENSITY) insideSolid.push({ x, y })
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

/** A bore as the drill stamp cuts it (#36): 1.9 m discs every quarter metre between points. */
function withBore(path: readonly { x: number; y: number }[]): WorldState {
  let world = EMPTY_WORLD
  for (let at = 1; at < path.length; at++) {
    const [from, to] = [path[at - 1], path[at]]
    const steps = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 0.25)
    for (let step = 0; step <= steps; step++) {
      const x = from.x + ((to.x - from.x) * step) / steps
      const y = from.y + ((to.y - from.y) * step) / steps
      const disc = {
        xMm: Math.round(x * 1000),
        yMm: Math.round(y * 1000),
        radiusMm: 950,
        floorRadiusMm: null,
      }
      world = clearDisc(world, PARAMS, disc, 255).world
    }
  }
  return world
}

/** A disc centre half a metre above a tile's centre puts the bore's floor at the tile's floor. */
function boreAxisAt(turns: number, along: number, depth: number): { x: number; y: number } {
  const centre = { x: SURFACE.tx + along + 0.5, y: SURFACE.ty - depth + 1 }
  return turnPoint(centre, turns)
}

const ANGLES = [0, 1, 2, 3]
const LIFT: VehicleIntent = { ...IDLE_INTENT, lift: true }

describe('vehicle physics', () => {
  it.each(ANGLES)('never tunnels through intact ground at 16 m/s (quarter turn %i)', (turns) => {
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

  it.each(ANGLES)(
    'enters, drives along and leaves a stamp-wide bore (quarter turn %i)',
    (turns) => {
      const bore = [boreAxisAt(turns, 0, -1), boreAxisAt(turns, 0, 7), boreAxisAt(turns, 5, 7)]
      const mouth = centreOf(localTile(turns, 0, -1))
      const harness = createHarness(withBore(bore), mouth)

      harness.run(IDLE_INTENT, 240)
      expect(harness.tile()).toEqual(localTile(turns, 0, 7))

      harness.run({ moveX: 1, facing: FACING.right, lift: false }, 120)
      expect(harness.tile()).toEqual(localTile(turns, 5, 7))

      harness.run({ moveX: -1, facing: FACING.left, lift: false }, 120)
      // Held against the shaft's round far wall the wheels ride up it; let go, the body settles.
      harness.run(IDLE_INTENT, 120)
      expect(harness.tile()).toEqual(localTile(turns, 0, 7))

      harness.run(LIFT, 150)
      const out = localTile(turns, 0, -1)
      const { x, y } = harness.body.translation()
      const outCentre = centreOf(out)
      expect(Math.sqrt(x * x + y * y)).toBeGreaterThan(
        Math.sqrt(outCentre.x ** 2 + outCentre.y ** 2) - 0.5,
      )
      expect(harness.insideSolid).toEqual([])
    },
  )
})
