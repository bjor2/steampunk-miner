import RAPIER from '@dimforge/rapier3d-compat'
import { beforeAll, describe, expect, it } from 'vitest'
import { PHYSICS_TIMESTEP, SUBSTEP_REACH_MM, MM_PER_METRE } from '../constants/physics'
import { blockOfPoint } from '../systems/vehicle/colliderHalo'
import { plannedTickOf } from '../systems/vehicle/tickPlan'
import { FACING } from '../systems/vehicle/vehiclePose'
import { clearDisc } from '../systems/world/groundEdit'
import { groundReaderOf } from '../systems/world/groundReader'
import { planetParamsFor } from '../systems/world/planetParams'
import { ISO_DENSITY } from '../systems/world/sampleGrid'
import { chunkKey, surfaceRowOfColumn } from '../systems/world/tileGrid'
import { EMPTY_WORLD, type WorldState } from '../systems/world/worldState'
import { planetPositionOf } from './bodyFrame'
import { createGroundHalo } from './groundHalo'
import { stepWorldThroughTick, sweepGroundOf } from './tickStepping'
import { createVehicleBody, HALO_RADIUS_BLOCKS } from './vehicleController'

// The tunnel regression spec (TD scope a on #316, ticket 334): the real body and collider halo,
// stepped through each tick's plan (`tickPlan.ts`, `tickStepping.ts`) with the velocity set every
// tick past any clamp, as the TD's #316 harness did. A fall onto the surface and shots into ribs of
// four thicknesses, 12 start phases each and every start outside the rib, never end with the body
// inside or beyond solid ground: at the substep reach for 1 to 4 substeps, and in the kinematic
// sweep past the budget.

const PARAMS = planetParamsFor(83921, 1)
const PHASES = 12
const TICKS_PER_SECOND = 1 / PHYSICS_TIMESTEP

/** m/s at the reach of 1 to 4 substeps, then two speeds the kinematic sweep carries. */
const SUBSTEP_SPEEDS = [1, 2, 3, 4].map(
  (count) => (count * SUBSTEP_REACH_MM * TICKS_PER_SECOND) / MM_PER_METRE,
)
const SWEEP_SPEEDS = [384, 1000]

beforeAll(async () => {
  await RAPIER.init()
})

interface Trial {
  world: WorldState
  start: { x: number; y: number }
  velocity: { x: number; y: number }
  ticks: number
  isPast: (position: { x: number; y: number }) => boolean
}

/** Whether the body ever ended a tick inside solid ground or beyond the far face. */
function tunnels({ world, start, velocity, ticks, isPast }: Trial): boolean {
  const rapierWorld = new RAPIER.World({ x: 0, y: 0, z: 0 })
  const pose = {
    x: Math.round(start.x * 1000),
    y: Math.round(start.y * 1000),
    vx: 0,
    vy: 0,
    upx: 0,
    upy: 1024,
    facing: FACING.right,
  }
  const { body, origin } = createVehicleBody(RAPIER, rapierWorld, pose)
  const halo = createGroundHalo(RAPIER, rapierWorld, HALO_RADIUS_BLOCKS, origin)
  const ground = groundReaderOf(world, PARAMS)
  const haloGround = {
    densityAt: ground.densityAt,
    chunkVersion: (cx: number, cy: number) => world.chunks[chunkKey(cx, cy)],
  }
  const syncHalo = () =>
    halo.syncAround(blockOfPoint(planetPositionOf(body, origin)), world, haloGround)
  let hasTunnelled = false
  for (let tick = 0; tick < ticks && !hasTunnelled; tick++) {
    const position = planetPositionOf(body, origin)
    const planned = plannedTickOf(velocity, PHYSICS_TIMESTEP, sweepGroundOf(ground, position, null))
    body.setLinvel({ ...planned.velocity, z: 0 }, true)
    body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    stepWorldThroughTick({ world: rapierWorld, body, syncHalo }, planned.plan)
    const after = planetPositionOf(body, origin)
    hasTunnelled = ground.densityAtPoint(after.x, after.y) >= ISO_DENSITY || isPast(after)
  }
  halo.dispose()
  rapierWorld.free()
  return hasTunnelled
}

/** A level bore of 1.9 m discs every quarter metre from `x0` to `x1` along `y`. */
function carveLine(world: WorldState, x0: number, x1: number, y: number): WorldState {
  let carved = world
  for (let step = 0; x0 + step * 0.25 <= x1; step++) {
    const disc = {
      xMm: Math.round((x0 + step * 0.25) * 1000),
      yMm: Math.round(y * 1000),
      radiusMm: 950,
      floorRadiusMm: null,
    }
    carved = clearDisc(carved, PARAMS, disc, 255).world
  }
  return carved
}

/** Falls of 12 phases onto the untouched surface of a column, from 5 m up. */
function surfaceFalls(speed: number): Trial[] {
  const column = 20
  const surfaceTop = surfaceRowOfColumn(column, PARAMS.radiusTiles) + 1
  return Array.from({ length: PHASES }, (_, phase) => ({
    world: EMPTY_WORLD,
    start: { x: column + 0.5, y: surfaceTop + 5 + (phase / PHASES) * (speed / TICKS_PER_SECOND) },
    velocity: { x: 0, y: -speed },
    ticks: Math.ceil((8 / speed) * TICKS_PER_SECOND) + 30,
    isPast: (position) => position.y < surfaceTop - 1.5,
  }))
}

/**
 * Level shots of 12 phases from a bore into a rib between it and a second bore. The phases spread
 * over one tick's step and all end 4 m short of the rib, so no start is inside or past it (the
 * #316 harness started its 768 m/s phases there).
 */
function ribShots(speed: number, gap: number): Trial[] {
  const y = 279.5
  const ribStart = 20
  const farBore = ribStart + 1.9 + gap
  const tickStep = speed / TICKS_PER_SECOND
  const firstStart = ribStart - 4 - tickStep
  const world = carveLine(
    carveLine(EMPTY_WORLD, firstStart - 2, ribStart, y),
    farBore,
    farBore + 8,
    y,
  )
  return Array.from({ length: PHASES }, (_, phase) => ({
    world,
    start: { x: firstStart + (phase / PHASES) * tickStep, y },
    velocity: { x: speed, y: 0 },
    ticks: Math.ceil((14 / speed) * TICKS_PER_SECOND) + 30,
    isPast: (position) => position.x > farBore - 0.95 + 0.45,
  }))
}

const tunnelledOf = (trials: Trial[]) => trials.filter(tunnels).length

describe('no tunnelling at speed (ticket 334)', () => {
  it.each([...SUBSTEP_SPEEDS, ...SWEEP_SPEEDS])(
    'never falls through the surface at %d m/s',
    (speed) => {
      expect(tunnelledOf(surfaceFalls(speed))).toBe(0)
    },
  )

  // Rib gaps 0.25 to 2 m leave 0.5 to 2.25 m of solid rock between the bores (#316's harness).
  it.each([0.25, 0.5, 1, 2])(
    'never passes a rib of nominal gap %d m at any planned speed',
    (gap) => {
      for (const speed of [...SUBSTEP_SPEEDS, ...SWEEP_SPEEDS]) {
        expect({ speed, tunnelled: tunnelledOf(ribShots(speed, gap)) }).toEqual({
          speed,
          tunnelled: 0,
        })
      }
    },
  )
})
