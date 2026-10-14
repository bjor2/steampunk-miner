/**
 * Ticket 337 acceptance (TD scope c2 on #316): with the chunk worker, main-thread terrain work
 * stays within 2 ms p95 a frame at 480 m/s, and no visible chunk shows unbuilt. A rig on planet 10
 * stands still until its first view is built, then drives straight at 480 m/s through cold ground
 * at the 20 m zoom-out, level along a chord and down from the surface, the drill cutting where
 * it stands every frame (untimed, the authority's work). Each frame runs the
 * scene's own worker streaming (`chunkJobStream.ts`: fresh results into three objects under the
 * budget, then the due jobs posted), timed as the main thread pays it: a job's structured clone
 * included, the meshes' GPU upload not. The worker runs in-process between frames, untimed, with at
 * most a frame's worth of its own time a frame, and its results are read the frame after.
 * Measured and printed, not gated in CI.
 */
import { performance } from 'node:perf_hooks'
import { Group, ShaderMaterial } from 'three'
import {
  CHUNK_STREAM_FRAMES_PER_SECOND,
  TERRAIN_FRAME_BUDGET_MS,
  VIEW_HALF_DIAGONAL_MAX_M,
} from '../../src/constants/scene'
import type { BenchmarkSeries } from '../../src/logging/benchmarkResult'
import { chunkNeedsOf, type BuiltChunk, type ChunkNeed } from '../../src/scene/chunkBuildNeeds'
import {
  chunkJobsOf,
  postChunkJobs,
  readChunkResults,
  type ChunkJobs,
  type MeshPartsSink,
} from '../../src/scene/chunkJobStream'
import { chunkMeshOf, disposeChunkMesh } from '../../src/scene/chunkMeshGeometry'
import type { ChunkWorkerPort } from '../../src/shell/chunkWorkerPort'
import { chunkBuildsPerFrame, prefetchLeadSeconds } from '../../src/systems/render/chunkBuildBudget'
import { chunksAheadOf } from '../../src/systems/render/chunkPrefetch'
import {
  runChunkMeshJob,
  type ChunkMeshJob,
  type ChunkMeshResult,
} from '../../src/systems/render/chunkMeshJob'
import { visibleChunksAround, type ChunkPoint } from '../../src/systems/render/visibleChunks'
import type { ShownChunk } from '../../src/systems/render/groundBlocks'
import type { Vector2 } from '../../src/systems/vehicle/localFrame'
import { planetParamsFor, type PlanetParams } from '../../src/systems/world/planetParams'
import { clearDisc } from '../../src/systems/world/groundEdit'
import { chunkKey } from '../../src/systems/world/tileGrid'
import { EMPTY_WORLD, type WorldState } from '../../src/systems/world/worldState'

const PLANET = 10
const SPEED_M_PER_S = 480
const SETTLE_FRAMES_MAX = 600
const FPS = CHUNK_STREAM_FRAMES_PER_SECOND
const WORKER_MS_PER_FRAME = 1000 / FPS

interface StreamDrive {
  name: string
  start: Vector2
  direction: Vector2
  seconds: number
}

/** Planet 10's radius is 720 m: the chord at 300 m from the centre is 1,308 m long. */
const DRIVES: readonly StreamDrive[] = [
  { name: 'level', start: { x: -600.5, y: 300.5 }, direction: { x: 1, y: 0 }, seconds: 2.5 },
  { name: 'down', start: { x: 0.5, y: 700.5 }, direction: { x: 0, y: -1 }, seconds: 1.25 },
]

/** A worker answering in order between frames, its results handed over without a copy. */
interface InProcessWorker {
  port: ChunkWorkerPort
  queue: ChunkMeshJob[]
  results: ChunkMeshResult[]
}

interface StreamRun {
  params: PlanetParams
  worker: InProcessWorker
  jobs: ChunkJobs
  meshes: Map<string, BuiltChunk>
  kept: Map<string, ShownChunk>
  material: ShaderMaterial
  parent: Group
  world: WorldState
  frame: number
  /** Chunks that needed a build last frame: the queue the prefetch lead outruns. */
  queueLength: number
  framesWithUnbuiltVisible: number
}

export function benchStreamThroughWorker(worldSeed: number): BenchmarkSeries[] {
  const params = planetParamsFor(worldSeed, PLANET)
  return DRIVES.map((drive) => benchDrive(params, drive))
}

function benchDrive(params: PlanetParams, drive: StreamDrive): BenchmarkSeries {
  const worker = inProcessWorker()
  const run: StreamRun = {
    params,
    worker,
    jobs: chunkJobsOf(worker.port),
    meshes: new Map(),
    kept: new Map(),
    material: new ShaderMaterial({ uniforms: { uDensity: { value: null } } }),
    parent: new Group(),
    world: EMPTY_WORLD,
    frame: 0,
    queueLength: 0,
    framesWithUnbuiltVisible: 0,
  }
  const settleFrames = settleAt(run, drive)
  const timesMs = Array.from({ length: Math.round(drive.seconds * FPS) }, (_, index) =>
    driveFrame(run, drive, (index + 1) / FPS),
  )
  printDrive(drive, settleFrames, timesMs, run)
  return { name: `chunkJobStream:${drive.name}`, planet: PLANET, timesMs }
}

function inProcessWorker(): InProcessWorker {
  const queue: ChunkMeshJob[] = []
  const results: ChunkMeshResult[] = []
  const port: ChunkWorkerPort = {
    // `postMessage` clones the job on the main thread; that clone is part of the frame.
    post: (job) => queue.push(structuredClone(job)),
    nextResult: () => results.shift() ?? null,
    isReady: () => true,
    hasFailed: () => false,
    terminate: () => undefined,
  }
  return { port, queue, results }
}

/** Frames at rest until the first view is built; not timed. */
function settleAt(run: StreamRun, drive: StreamDrive): number {
  for (let frame = 1; frame <= SETTLE_FRAMES_MAX; frame++) {
    streamFrame(run, drive.start, { x: 0, y: 0 }, drive.direction)
    if (isEveryVisibleBuilt(run, drive.start)) return frame
  }
  throw new Error(`the first view on planet ${PLANET} never finished building`)
}

function driveFrame(run: StreamRun, drive: StreamDrive, seconds: number): number {
  const travelled = SPEED_M_PER_S * seconds
  const centre = {
    x: drive.start.x + drive.direction.x * travelled,
    y: drive.start.y + drive.direction.y * travelled,
  }
  const velocity = { x: drive.direction.x * SPEED_M_PER_S, y: drive.direction.y * SPEED_M_PER_S }
  cutAt(run, centre)
  const elapsedMs = streamFrame(run, centre, velocity, drive.direction)
  if (!isEveryVisibleBuilt(run, centre)) run.framesWithUnbuiltVisible++
  return elapsedMs
}

/** One frame: the main thread's part timed, then the worker's between frames. */
function streamFrame(run: StreamRun, centre: Vector2, velocity: Vector2, facing: Vector2): number {
  run.frame++
  keepChunksAround(run, centre, velocity, facing)
  const started = performance.now()
  readChunkResults(run.jobs, meshPartsSinkOf(run))
  const needs = needsNow(run)
  run.queueLength = needs.length
  const view = {
    params: run.params,
    world: run.world,
    viewRadius: VIEW_HALF_DIAGONAL_MAX_M,
    velocity,
  }
  postChunkJobs(run.jobs, needs, run.frame, view)
  const elapsedMs = performance.now() - started
  runWorkerFrame(run.worker)
  return elapsedMs
}

function keepChunksAround(
  run: StreamRun,
  centre: Vector2,
  velocity: Vector2,
  facing: Vector2,
): void {
  const radius = run.params.radiusTiles
  const visible = visibleChunksAround(centre, VIEW_HALF_DIAGONAL_MAX_M, radius)
  const builds = chunkBuildsPerFrame(Math.hypot(velocity.x, velocity.y), VIEW_HALF_DIAGONAL_MAX_M)
  const ahead = chunksAheadOf({
    centre,
    viewRadius: VIEW_HALF_DIAGONAL_MAX_M,
    velocity,
    facing,
    leadSeconds: prefetchLeadSeconds(run.queueLength, builds),
    planetRadiusTiles: radius,
  })
  run.kept.clear()
  for (const chunk of ahead) run.kept.set(keyOf(chunk), { ...chunk, blockMask: 0 })
  for (const chunk of visible) run.kept.set(keyOf(chunk), { ...chunk, blockMask: 0xffff })
}

function needsNow(run: StreamRun): ChunkNeed[] {
  const shown = [...run.kept.values()]
  const chunks = {
    meshes: run.meshes,
    visible: shown.filter((chunk) => chunk.blockMask !== 0),
    ahead: shown.filter((chunk) => chunk.blockMask === 0),
  }
  return chunkNeedsOf(chunks, { params: run.params, world: run.world })
}

/** The drill's bore where the rig stands: a new delta for its chunk, as a cut every tick gives. */
function cutAt(run: StreamRun, centre: Vector2): void {
  const disc = {
    xMm: Math.round(centre.x * 1000),
    yMm: Math.round(centre.y * 1000),
    radiusMm: 950,
    floorRadiusMm: null,
  }
  run.world = clearDisc(run.world, run.params, disc, 255).world
}

function meshPartsSinkOf(run: StreamRun): MeshPartsSink {
  return (key, built, parts) => {
    const shown = run.kept.get(key)
    if (shown === undefined) return
    const chunk = chunkMeshOf(run.material, shown, built, parts)
    run.parent.add(chunk.mesh)
    disposeChunkMesh(run.parent, chunk)
    run.meshes.set(key, chunk)
  }
}

/** The worker between frames: jobs in order while a frame of its own time lasts. */
function runWorkerFrame(worker: InProcessWorker): void {
  const started = performance.now()
  while (worker.queue.length > 0 && performance.now() - started < WORKER_MS_PER_FRAME) {
    worker.results.push(runChunkMeshJob(worker.queue.shift() as ChunkMeshJob))
  }
}

function isEveryVisibleBuilt(run: StreamRun, centre: Vector2): boolean {
  const visible = visibleChunksAround(centre, VIEW_HALF_DIAGONAL_MAX_M, run.params.radiusTiles)
  return visible.every((chunk) => run.meshes.has(keyOf(chunk)))
}

const keyOf = ({ cx, cy }: ChunkPoint) => chunkKey(cx, cy)

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
  console.log(
    JSON.stringify({
      bench: 'chunkJobStream',
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
      isWithinBudget: p95Ms <= TERRAIN_FRAME_BUDGET_MS && run.framesWithUnbuiltVisible === 0,
    }),
  )
}
