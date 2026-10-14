/**
 * The physics step at speed (TD scope a on #316, ticket 334 acceptance): one fixed tick of the
 * real body and collider halo, stepped through its plan (`tickPlan.ts`, `tickStepping.ts`), costs
 * p50 1 ms or less at 384 m/s, where the plan is the kinematic sweep. Measured and logged here, not
 * gated: p95 is judged on the reference machine. Run with `npm run bench:physics` (`-- --log`
 * writes `benchmark_result` lines, #124).
 *
 * As the TD's #316 harness: a level bore on planet 1 at 279.5 m from the centre, the body shot
 * along it with its velocity set every tick, at 24, 48, 96 and 384 m/s (1, 2 and 4 substeps, then
 * the sweep). Each tick is timed from the plan to the end of its world steps, halo syncs included.
 */
import RAPIER from '@dimforge/rapier3d-compat'
import { loadFeatures } from '../src/features'
import { PHYSICS_TIMESTEP } from '../src/constants/physics'
import { planetPositionOf } from '../src/physics/bodyFrame'
import { createGroundHalo } from '../src/physics/groundHalo'
import { stepWorldThroughTick, sweepGroundOf } from '../src/physics/tickStepping'
import { createVehicleBody, HALO_RADIUS_BLOCKS } from '../src/physics/vehicleController'
import { blockOfPoint } from '../src/systems/vehicle/colliderHalo'
import { plannedTickOf } from '../src/systems/vehicle/tickPlan'
import { FACING } from '../src/systems/vehicle/vehiclePose'
import { clearDisc } from '../src/systems/world/groundEdit'
import { groundReaderOf } from '../src/systems/world/groundReader'
import { planetParamsFor } from '../src/systems/world/planetParams'
import { chunkKey } from '../src/systems/world/tileGrid'
import { EMPTY_WORLD, type WorldState } from '../src/systems/world/worldState'
import { logBenchmarkSeriesWhenAsked } from './bench/benchRunLog'

loadFeatures()
await RAPIER.init()

const PARAMS = planetParamsFor(83921, 1)
const SPEEDS_M_PER_S = [24, 48, 96, 384]
const REPS = 3
const TICKS = 30
const BORE = { fromX: -100, toX: 100, y: 279.5 }
const BUDGET = { p50MsAt384: 1 }

function carveBore(): WorldState {
  let world = EMPTY_WORLD
  for (let x = BORE.fromX; x <= BORE.toX; x += 0.25) {
    const disc = {
      xMm: Math.round(x * 1000),
      yMm: BORE.y * 1000,
      radiusMm: 950,
      floorRadiusMm: null,
    }
    world = clearDisc(world, PARAMS, disc, 255).world
  }
  return world
}

/** One shot along the bore at `speed`: the time of each tick, in ms. */
function shootAlong(world: WorldState, speed: number): number[] {
  const rapierWorld = new RAPIER.World({ x: 0, y: 0, z: 0 })
  const pose = { x: (BORE.fromX + 2) * 1000, y: BORE.y * 1000, vx: 0, vy: 0, upx: 0, upy: 1024 }
  const { body, origin } = createVehicleBody(RAPIER, rapierWorld, { ...pose, facing: FACING.right })
  const halo = createGroundHalo(RAPIER, rapierWorld, HALO_RADIUS_BLOCKS, origin)
  const ground = groundReaderOf(world, PARAMS)
  const haloGround = {
    densityAt: ground.densityAt,
    chunkVersion: (cx: number, cy: number) => world.chunks[chunkKey(cx, cy)],
  }
  const syncHalo = () =>
    halo.syncAround(blockOfPoint(planetPositionOf(body, origin)), world, haloGround)
  const velocity = { x: speed, y: 0 }
  const timesMs: number[] = []
  for (let tick = 0; tick < TICKS; tick++) {
    const started = performance.now()
    const position = planetPositionOf(body, origin)
    const planned = plannedTickOf(velocity, PHYSICS_TIMESTEP, sweepGroundOf(ground, position, null))
    body.setLinvel({ ...planned.velocity, z: 0 }, true)
    stepWorldThroughTick({ world: rapierWorld, body, syncHalo }, planned.plan)
    timesMs.push(performance.now() - started)
  }
  halo.dispose()
  rapierWorld.free()
  return timesMs
}

function benchAt(world: WorldState, speed: number): number[] {
  shootAlong(world, speed)
  return Array.from({ length: REPS }, () => shootAlong(world, speed)).flat()
}

function percentile(times: readonly number[], fraction: number): number {
  const sorted = [...times].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]
}

const round = (ms: number) => Number(ms.toFixed(3))

const world = carveBore()
const runs = SPEEDS_M_PER_S.map((speed) => ({ speed, timesMs: benchAt(world, speed) }))
console.log(
  JSON.stringify({
    bench: 'physicsAtSpeed',
    rows: runs.map(({ speed, timesMs }) => ({
      speed,
      tickP50Ms: round(percentile(timesMs, 0.5)),
      tickP95Ms: round(percentile(timesMs, 0.95)),
    })),
    budget: BUDGET,
  }),
)
logBenchmarkSeriesWhenAsked(
  'physics-speed',
  runs.map(({ speed, timesMs }) => ({ name: `physicsTick.${speed}`, planet: 1, timesMs })),
)
