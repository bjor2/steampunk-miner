/**
 * Decision #36 acceptance 7: during continuous drilling, carve plus re-mesh at most 1 ms at the
 * 95th percentile, terrain work at most 2 ms per frame, at most 600 live colliders. Measured and
 * logged here, not gated in CI, because CI machines vary. Run with `npm run bench:ground`.
 *
 * A scripted vehicle drills down 20 m and then sideways 40 m through planet 1, reporting its pose
 * every 12 ticks as the client does. Per report it times the authority's carve (the reportPose
 * command), the re-mesh of one changed chunk (its density halo and tile batch, the most the scene
 * rebuilds per frame), and the collision blocks of the 3 x 3 halo whose chunks changed.
 */
import { applyCommand } from '../src/systems/authority/applyCommand'
import { createAuthorityState, type AuthorityState } from '../src/systems/authority/authorityState'
import type { DomainEvent } from '../src/systems/authority/domainEvent'
import { planetParamsOf } from '../src/systems/authority/planetOfState'
import { buildChunkTileBatch } from '../src/systems/render/chunkTileBatch'
import { chunkDensityHaloOf } from '../src/systems/render/densityHalo'
import {
  blockOfPoint,
  blocksAround,
  chunksUnderBlock,
  wallSegmentsOf,
} from '../src/systems/vehicle/colliderHalo'
import { FACING, type Facing } from '../src/systems/vehicle/vehiclePose'
import { groundReaderOf } from '../src/systems/world/groundReader'
import type { PlanetParams } from '../src/systems/world/planetParams'
import { currentDensityOfChunk, materialCellsOfChunk } from '../src/systems/world/worldState'

const WORLD_SEED = 83921
const REPORT_TICKS = 12
const STEP_MM = 250
const BUDGET = { carveAndRemeshP95Ms: 1, terrainFrameP95Ms: 2, liveColliders: 600 }

interface Timings {
  carveMs: number[]
  remeshMs: number[]
  blocksMs: number[]
  frameMs: number[]
  liveColliders: number[]
}

function timed<T>(work: () => T): { value: T; ms: number } {
  const start = performance.now()
  const value = work()
  return { value, ms: performance.now() - start }
}

function reportPose(state: AuthorityState, seq: number, x: number, y: number, facing: Facing) {
  const payload = {
    x,
    y,
    vx: 0,
    vy: 0,
    upx: 0,
    upy: 1024,
    facing,
    driving: false,
    thrusting: false,
    drilling: true,
    thrustTicks: 0,
    driveTicks: 0,
    drillTicks: REPORT_TICKS,
  }
  const command = {
    playerId: 'p1',
    tick: state.tick + REPORT_TICKS,
    seq,
    type: 'reportPose',
    payload,
  }
  return applyCommand(state, command as Parameters<typeof applyCommand>[1])
}

function refill(state: AuthorityState, seq: number) {
  const command = {
    playerId: 'p1',
    tick: state.tick,
    seq,
    type: 'debug.setEnergy',
    payload: { energy: '150' },
  }
  return applyCommand(state, command as Parameters<typeof applyCommand>[1]).state
}

function changedChunksOf(events: readonly DomainEvent[]): { cx: number; cy: number }[] {
  return events.flatMap((event) =>
    event.type === 'GroundChanged' ? [{ cx: event.cx, cy: event.cy }] : [],
  )
}

function remesh(state: AuthorityState, params: PlanetParams, chunk: { cx: number; cy: number }) {
  const densityOf = (x: number, y: number) => currentDensityOfChunk(state.world, params, x, y)
  const halo = chunkDensityHaloOf(densityOf, chunk.cx, chunk.cy)
  const cells = materialCellsOfChunk(state.world, params, chunk.cx, chunk.cy)
  return buildChunkTileBatch(params, chunk.cx, chunk.cy, cells, halo)
}

/** The halo blocks round the vehicle over a changed chunk, rebuilt; answers the live colliders. */
function rebuildBlocks(
  state: AuthorityState,
  params: PlanetParams,
  xMm: number,
  yMm: number,
  changed: string[],
) {
  const ground = groundReaderOf(state.world, params)
  let live = 0
  for (const block of blocksAround(blockOfPoint({ x: xMm / 1000, y: yMm / 1000 }), 1)) {
    const isChanged = chunksUnderBlock(block).some(({ cx, cy }) => changed.includes(`${cx},${cy}`))
    const segments = isChanged ? wallSegmentsOf(block, ground.densityAt) : [1]
    if (segments.length > 0) live++
  }
  return live
}

function drillPath(): { x: number; y: number; facing: Facing }[] {
  const path: { x: number; y: number; facing: Facing }[] = []
  for (let down = 0; down < 80; down++)
    path.push({ x: 8500, y: 299500 - down * STEP_MM, facing: FACING.down })
  for (let side = 0; side < 160; side++)
    path.push({ x: 8500 + side * STEP_MM, y: 279500, facing: FACING.right })
  return path
}

function benchDrilling(): Timings {
  let state = createAuthorityState({ planetIndex: 1, planetSeed: WORLD_SEED, playerIds: ['p1'] })
  const params = planetParamsOf(state.planet) as PlanetParams
  const timings: Timings = {
    carveMs: [],
    remeshMs: [],
    blocksMs: [],
    frameMs: [],
    liveColliders: [],
  }
  let seq = 1
  for (const step of drillPath()) {
    state = refill(state, seq++)
    const carve = timed(() => reportPose(state, seq++, step.x, step.y, step.facing))
    state = carve.value.state
    const changed = changedChunksOf(carve.value.events)
    const keys = changed.map(({ cx, cy }) => `${cx},${cy}`)
    const remeshMs = changed.length === 0 ? 0 : timed(() => remesh(state, params, changed[0])).ms
    const blocks = timed(() => rebuildBlocks(state, params, step.x, step.y, keys))
    timings.carveMs.push(carve.ms)
    timings.remeshMs.push(remeshMs)
    timings.blocksMs.push(blocks.ms)
    timings.frameMs.push(carve.ms + remeshMs + blocks.ms)
    timings.liveColliders.push(blocks.value)
  }
  return timings
}

function percentile(times: readonly number[], fraction: number): number {
  const sorted = [...times].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]
}

const round = (ms: number) => Number(ms.toFixed(3))

benchDrilling()
const timings = benchDrilling()
const carveAndRemesh = timings.carveMs.map((ms, at) => ms + timings.remeshMs[at])
const report = {
  bench: 'groundDrilling',
  reports: timings.carveMs.length,
  carveP95Ms: round(percentile(timings.carveMs, 0.95)),
  remeshChunkP95Ms: round(percentile(timings.remeshMs, 0.95)),
  colliderBlocksP95Ms: round(percentile(timings.blocksMs, 0.95)),
  carveAndRemeshP95Ms: round(percentile(carveAndRemesh, 0.95)),
  terrainFrameP95Ms: round(percentile(timings.frameMs, 0.95)),
  liveCollidersMax: Math.max(...timings.liveColliders),
  budget: BUDGET,
}
console.log(JSON.stringify(report))
