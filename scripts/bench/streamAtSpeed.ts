/**
 * Ticket 336 acceptance (TD scope c1 on #316): main-thread terrain work stays within 2 ms p95 a
 * frame at 120 m/s without the generation worker, no visible chunk shows unbuilt, and a newly
 * visible chunk waits at most 4 frames. A rig on planet 10 stands still until its first view is
 * built, then drives straight at 120 m/s through cold ground at the 20 m zoom-out, level along a
 * chord and down from the surface, the drill staling the chunk it is in every frame. Each frame
 * runs the scene's own streaming (`streamChunkFrame`: prefetch along the velocity, generation, the
 * speed-scaled builds, the 2 ms budget) with real generation and real tile batches; the GPU upload
 * of a mesh is not in it. Measured and printed, not gated in CI.
 */
import { performance } from 'node:perf_hooks'
import type { BenchmarkSeries } from '../../src/logging/benchmarkResult'
import { streamChunkFrame } from '../../src/scene/chunkStreamFrame'
import {
  CHUNK_STREAM_FRAMES_PER_SECOND,
  TERRAIN_FRAME_BUDGET_MS,
  VIEW_HALF_DIAGONAL_MAX_M,
} from '../../src/constants/scene'
import { chunkBuildsPerFrame, prefetchLeadSeconds } from '../../src/systems/render/chunkBuildBudget'
import type { ChunkBuildNeed } from '../../src/systems/render/chunkBuilds'
import { chunksAheadOf } from '../../src/systems/render/chunkPrefetch'
import { buildChunkTileBatch } from '../../src/systems/render/chunkTileBatch'
import { chunkDensityHaloOf } from '../../src/systems/render/densityHalo'
import { visibleChunksAround, type ChunkPoint } from '../../src/systems/render/visibleChunks'
import type { Vector2 } from '../../src/systems/vehicle/localFrame'
import { planetParamsFor, type PlanetParams } from '../../src/systems/world/planetParams'
import { CHUNK_SIZE, chunkKey } from '../../src/systems/world/tileGrid'
import {
  currentDensityOfChunk,
  EMPTY_WORLD,
  materialCellsOfChunk,
} from '../../src/systems/world/worldState'

const PLANET = 10
const SPEED_M_PER_S = 120
const SETTLE_FRAMES_MAX = 600
const FPS = CHUNK_STREAM_FRAMES_PER_SECOND
const MAX_NEW_CHUNK_WAIT_FRAMES = 4

interface StreamDrive {
  name: string
  start: Vector2
  direction: Vector2
  seconds: number
}

/** Planet 10's radius is 720 m: the chord at 300 m from the centre is 1,308 m long. */
const DRIVES: readonly StreamDrive[] = [
  { name: 'level', start: { x: -600.5, y: 300.5 }, direction: { x: 1, y: 0 }, seconds: 10 },
  { name: 'down', start: { x: 0.5, y: 700.5 }, direction: { x: 0, y: -1 }, seconds: 5 },
]

interface BuiltChunk {
  builtFrame: number
  isStale: boolean
}

interface StreamRun {
  params: PlanetParams
  built: Map<string, BuiltChunk>
  /** The frame each chunk first came into view on the drive. */
  seen: Map<string, number>
  waits: number[]
  framesWithUnbuiltVisible: number
  queueLength: number
}

export function benchStreamAtSpeed(worldSeed: number): BenchmarkSeries[] {
  const params = planetParamsFor(worldSeed, PLANET)
  return DRIVES.map((drive) => benchDrive(params, drive))
}

function benchDrive(params: PlanetParams, drive: StreamDrive): BenchmarkSeries {
  const run: StreamRun = {
    params,
    built: new Map(),
    seen: new Map(),
    waits: [],
    framesWithUnbuiltVisible: 0,
    queueLength: 0,
  }
  const settleFrames = settleAt(run, drive)
  const timesMs = Array.from({ length: drive.seconds * FPS }, (_, index) =>
    driveFrame(run, drive, settleFrames + index + 1, (index + 1) / FPS),
  )
  printDrive(drive, settleFrames, timesMs, run)
  return { name: `chunkStreamFrame:${drive.name}`, planet: PLANET, timesMs }
}

/** Frames at rest until the first view is built; not timed. */
function settleAt(run: StreamRun, drive: StreamDrive): number {
  for (let frame = 1; frame <= SETTLE_FRAMES_MAX; frame++) {
    if (streamFrame(run, drive, frame, drive.start, 0)) return frame
  }
  throw new Error(`the first view on planet ${PLANET} never finished building`)
}

function driveFrame(run: StreamRun, drive: StreamDrive, frame: number, seconds: number): number {
  const travelled = SPEED_M_PER_S * seconds
  const centre = {
    x: drive.start.x + drive.direction.x * travelled,
    y: drive.start.y + drive.direction.y * travelled,
  }
  noteSeen(run, centre, frame)
  const started = performance.now()
  streamFrame(run, drive, frame, centre, SPEED_M_PER_S)
  const elapsedMs = performance.now() - started
  noteUnbuiltVisible(run, centre)
  return elapsedMs
}

/** One frame of the scene's streaming; true when every need was built. */
function streamFrame(
  run: StreamRun,
  drive: StreamDrive,
  frame: number,
  centre: Vector2,
  speed: number,
): boolean {
  const velocity = { x: drive.direction.x * speed, y: drive.direction.y * speed }
  const view = { params: run.params, viewRadius: VIEW_HALF_DIAGONAL_MAX_M, velocity }
  staleDrilledChunk(run, centre)
  const needs = needsAt(run, centre, velocity, drive.direction)
  run.queueLength = needs.length
  return streamChunkFrame(needs, frame, view, (need) => buildChunk(run, need, frame))
}

function needsAt(
  run: StreamRun,
  centre: Vector2,
  velocity: Vector2,
  facing: Vector2,
): ChunkBuildNeed[] {
  const radius = run.params.radiusTiles
  const speed = Math.hypot(velocity.x, velocity.y)
  const builds = chunkBuildsPerFrame(speed, VIEW_HALF_DIAGONAL_MAX_M)
  const visible = visibleChunksAround(centre, VIEW_HALF_DIAGONAL_MAX_M, radius)
  const ahead = chunksAheadOf({
    centre,
    viewRadius: VIEW_HALF_DIAGONAL_MAX_M,
    velocity,
    facing,
    leadSeconds: prefetchLeadSeconds(run.queueLength, builds),
    planetRadiusTiles: radius,
  })
  return [
    ...visible.flatMap((chunk) => needOf(run, chunk, true)),
    ...ahead.flatMap((chunk) => needOf(run, chunk, false)),
  ]
}

function needOf(run: StreamRun, { cx, cy }: ChunkPoint, isVisible: boolean): ChunkBuildNeed[] {
  const key = chunkKey(cx, cy)
  const built = run.built.get(key)
  if (built !== undefined && !built.isStale) return []
  const builtFrame = built?.builtFrame ?? 0
  return [{ key, cx, cy, isVisible, isBuilt: built !== undefined, builtFrame }]
}

/** What the pool's build does on the CPU: the density halo and the tile batch. */
function buildChunk(run: StreamRun, need: ChunkBuildNeed, frame: number): void {
  const { params } = run
  const densityOf = (x: number, y: number) => currentDensityOfChunk(EMPTY_WORLD, params, x, y)
  const halo = chunkDensityHaloOf(densityOf, need.cx, need.cy)
  buildChunkTileBatch(
    params,
    need.cx,
    need.cy,
    materialCellsOfChunk(EMPTY_WORLD, params, need.cx, need.cy),
    halo,
  )
  noteWait(run, need.key, frame, need.isBuilt)
  run.built.set(need.key, { builtFrame: frame, isStale: false })
}

function staleDrilledChunk(run: StreamRun, centre: Vector2): void {
  const key = chunkKey(Math.floor(centre.x / CHUNK_SIZE), Math.floor(centre.y / CHUNK_SIZE))
  const built = run.built.get(key)
  if (built !== undefined) built.isStale = true
}

function noteSeen(run: StreamRun, centre: Vector2, frame: number): void {
  for (const chunk of visibleChunksAround(centre, VIEW_HALF_DIAGONAL_MAX_M, run.params.radiusTiles))
    if (!run.seen.has(chunkKey(chunk.cx, chunk.cy)))
      run.seen.set(chunkKey(chunk.cx, chunk.cy), frame)
}

function noteWait(run: StreamRun, key: string, frame: number, wasBuilt: boolean): void {
  const seenFrame = run.seen.get(key)
  if (!wasBuilt && seenFrame !== undefined) run.waits.push(frame - seenFrame)
}

function noteUnbuiltVisible(run: StreamRun, centre: Vector2): void {
  const visible = visibleChunksAround(centre, VIEW_HALF_DIAGONAL_MAX_M, run.params.radiusTiles)
  const isAnyUnbuilt = visible.some(({ cx, cy }) => !run.built.has(chunkKey(cx, cy)))
  if (isAnyUnbuilt) run.framesWithUnbuiltVisible++
}

function percentile(times: readonly number[], fraction: number): number {
  const sorted = [...times].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]
}

function printDrive(
  drive: StreamDrive,
  settleFrames: number,
  timesMs: readonly number[],
  run: StreamRun,
): void {
  const p95Ms = percentile(timesMs, 0.95)
  const maxWaitFrames = Math.max(0, ...run.waits)
  console.log(
    JSON.stringify({
      bench: 'chunkStreamFrame',
      planetIndex: PLANET,
      drive: drive.name,
      speedMPerS: SPEED_M_PER_S,
      settleFrames,
      frames: timesMs.length,
      p50Ms: Number(percentile(timesMs, 0.5).toFixed(3)),
      p95Ms: Number(p95Ms.toFixed(3)),
      maxMs: Number(Math.max(...timesMs).toFixed(3)),
      budgetP95Ms: TERRAIN_FRAME_BUDGET_MS,
      framesWithUnbuiltVisible: run.framesWithUnbuiltVisible,
      maxNewChunkWaitFrames: maxWaitFrames,
      isWithinBudget:
        p95Ms <= TERRAIN_FRAME_BUDGET_MS &&
        run.framesWithUnbuiltVisible === 0 &&
        maxWaitFrames <= MAX_NEW_CHUNK_WAIT_FRAMES,
    }),
  )
}
