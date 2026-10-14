import { describe, expect, it } from 'vitest'
import { MAX_SPEED_MM_PER_SECOND } from '../../constants/balance'
import { MM_PER_METRE } from '../../constants/physics'
import {
  CHUNK_STREAM_FRAMES_PER_SECOND,
  TERRAIN_FRAME_BUDGET_MS,
  VIEW_HALF_DIAGONAL_MAX_M,
} from '../../constants/scene'
import type { Vector2 } from '../vehicle/localFrame'
import { EMPTY_CHUNK_DELTA, type ChunkDelta } from '../world/chunkDelta'
import { CHUNK_SIZE } from '../world/tileGrid'
import { CACHED_CHUNKS } from '../world/worldState'
import { chunkBuildsPerFrame, prefetchLeadSeconds, spendFrameBudgetOn } from './chunkBuildBudget'
import { chunksToBuild, type ChunkBuildNeed } from './chunkBuilds'
import {
  bookJob,
  createChunkJobBook,
  isJobDue,
  roomForJobs,
  takeFreshResult,
  type ChunkJobBook,
} from './chunkJobBook'
import { chunksAheadOf } from './chunkPrefetch'
import { isSameChunkView, type ChunkViewVersion } from './chunkViewVersion'
import { haloChunksOf } from './densityHalo'
import { visibleChunksAround, type ChunkPoint } from './visibleChunks'

// The terrain's streaming through the chunk worker (TD scope c2 on #316, ticket 337): a straight
// drive at the widest zoom from a rig that stood still until its first view was built, the drill
// giving the chunk it is in a new delta every frame. Each frame runs the real rules (the job book,
// prefetch along the velocity, the speed-scaled picks, the 2 ms budget). Modelled costs: one
// worker thread spends at most a frame's time a frame on the TD's p50s on #316 (generation
// 1.9 ms a chunk its own LRU of `CACHED_CHUNKS` lacks, a mesh 1.1 ms), and its results are read
// the frame after their job was posted. The main thread pays only posting a job and turning a
// result into a mesh, assumed below and measured on real chunks by `npm run bench:render`.

const FPS = CHUNK_STREAM_FRAMES_PER_SECOND
const FRAME_MS = 1000 / FPS
const PLANET_RADIUS_TILES = 100_000
const START = { x: 16.5, y: 50_000 }
const SETTLE_FRAMES = 2 * FPS
const BOT_TOP_SPEED = MAX_SPEED_MM_PER_SECOND / MM_PER_METRE
const GENERATE_MS = 1.9
const MESH_MS = 1.1
/** Building the job and cloning its deltas into `postMessage`. */
const POST_MS = 0.05
/** The geometry, the density texture and the shown blocks' copy of one result. */
const INSTALL_MS = 0.25

interface Drive {
  speed: number
  direction: Vector2
  seconds: number
}

interface ShownMesh {
  builtFrame: number
  version: ChunkViewVersion
}

interface Job {
  id: number
  chunk: ChunkPoint
}

interface Streaming {
  mainMs: number[]
  waits: number[]
  framesWithUnbuiltVisible: number
  isFirstViewBuilt: boolean
}

interface StreamState {
  book: ChunkJobBook
  meshes: Map<string, ShownMesh>
  /** The world's delta of each chunk the drill touched: the view versions read it. */
  deltas: Map<string, ChunkDelta>
  seen: Map<string, number>
  queue: Job[]
  /** Results the worker finished, read from the next frame on. */
  done: Job[]
  workerCache: Set<string>
}

const keyOf = ({ cx, cy }: ChunkPoint) => `${cx},${cy}`

function stream(drive: Drive): Streaming {
  const state: StreamState = {
    book: createChunkJobBook(),
    meshes: new Map(),
    deltas: new Map(),
    seen: new Map(),
    queue: [],
    done: [],
    workerCache: new Set(),
  }
  const streaming: Streaming = {
    mainMs: [],
    waits: [],
    framesWithUnbuiltVisible: 0,
    isFirstViewBuilt: false,
  }
  let queueLength = 0
  for (let frame = 1; frame <= SETTLE_FRAMES + drive.seconds * FPS; frame++) {
    const isDriving = frame > SETTLE_FRAMES
    const speed = isDriving ? drive.speed : 0
    const travelled = isDriving ? (drive.speed * (frame - SETTLE_FRAMES)) / FPS : 0
    const centre = {
      x: START.x + drive.direction.x * travelled,
      y: START.y + drive.direction.y * travelled,
    }
    const drilled = { cx: Math.floor(centre.x / CHUNK_SIZE), cy: Math.floor(centre.y / CHUNK_SIZE) }
    state.deltas.set(keyOf(drilled), { ...EMPTY_CHUNK_DELTA, version: frame })
    const builds = chunkBuildsPerFrame(speed, VIEW_HALF_DIAGONAL_MAX_M)
    const visible = visibleChunksAround(centre, VIEW_HALF_DIAGONAL_MAX_M, PLANET_RADIUS_TILES)
    const ahead = chunksAheadOf({
      centre,
      viewRadius: VIEW_HALF_DIAGONAL_MAX_M,
      velocity: { x: drive.direction.x * speed, y: drive.direction.y * speed },
      facing: drive.direction,
      leadSeconds: prefetchLeadSeconds(queueLength, builds),
      planetRadiusTiles: PLANET_RADIUS_TILES,
    })
    for (const chunk of visible)
      if (!state.seen.has(keyOf(chunk))) state.seen.set(keyOf(chunk), frame)
    const kept = new Set([...visible, ...ahead].map(keyOf))
    const readMs = readResults(state, kept, frame, isDriving ? streaming.waits : [])
    const needs = [
      ...visible.flatMap((chunk) => needOf(state, chunk, true)),
      ...ahead.flatMap((chunk) => needOf(state, chunk, false)),
    ]
    queueLength = needs.length
    const postMs = postJobs(state, needs, frame)
    runWorkerFrame(state)
    const hasUnbuilt = visible.some((chunk) => !state.meshes.has(keyOf(chunk)))
    if (isDriving) {
      streaming.mainMs.push(readMs + postMs)
      if (hasUnbuilt) streaming.framesWithUnbuiltVisible++
    } else {
      streaming.isFirstViewBuilt ||= !hasUnbuilt
    }
  }
  return streaming
}

function versionOf(state: StreamState, { cx, cy }: ChunkPoint): ChunkViewVersion {
  return haloChunksOf(cx, cy).map((chunk) => state.deltas.get(keyOf(chunk)))
}

type Need = ChunkBuildNeed & { version: ChunkViewVersion }

function needOf(state: StreamState, chunk: ChunkPoint, isVisible: boolean): Need[] {
  const key = keyOf(chunk)
  const version = versionOf(state, chunk)
  const mesh = state.meshes.get(key)
  if (mesh !== undefined && isSameChunkView(mesh.version, version)) return []
  const builtFrame = mesh?.builtFrame ?? 0
  return [{ key, ...chunk, isVisible, isBuilt: mesh !== undefined, builtFrame, version }]
}

/** Reads results on the frame's budget; answers the main thread's modelled milliseconds. */
function readResults(
  state: StreamState,
  kept: Set<string>,
  frame: number,
  waits: number[],
): number {
  let spentMs = 0
  const install = (job: Job): number => {
    const key = keyOf(job.chunk)
    const view = takeFreshResult(state.book, key, job.id)
    if (view === null || !kept.has(key)) return 0
    if (!state.meshes.has(key) && state.seen.has(key))
      waits.push(frame - (state.seen.get(key) ?? 0))
    state.meshes.set(key, { builtFrame: view.frame, version: view.version })
    spentMs += INSTALL_MS
    return INSTALL_MS
  }
  spendFrameBudgetOn(() => state.done.shift() ?? null, install, TERRAIN_FRAME_BUDGET_MS)
  return spentMs
}

function postJobs(state: StreamState, needs: readonly Need[], frame: number): number {
  const due = needs.filter((need) => isJobDue(state.book, need, frame))
  const picked = chunksToBuild(due, frame, roomForJobs(state.book))
  for (const need of picked) {
    state.queue.push({ id: bookJob(state.book, need, frame), chunk: { cx: need.cx, cy: need.cy } })
  }
  return picked.length * POST_MS
}

/** The worker between this frame and the next: jobs in order while a frame's time lasts. */
function runWorkerFrame(state: StreamState): void {
  let spentMs = 0
  while (state.queue.length > 0 && spentMs < FRAME_MS) {
    const job = state.queue.shift() as Job
    spentMs += MESH_MS + GENERATE_MS * generatedFor(state.workerCache, job.chunk)
    state.done.push(job)
  }
}

/** Halo chunks the worker's cache lacked, now held, least recent ones dropped past its size. */
function generatedFor(cache: Set<string>, chunk: ChunkPoint): number {
  let generated = 0
  for (const halo of haloChunksOf(chunk.cx, chunk.cy)) {
    if (!cache.delete(keyOf(halo))) generated++
    cache.add(keyOf(halo))
  }
  for (const old of cache) {
    if (cache.size <= CACHED_CHUNKS) break
    cache.delete(old)
  }
  return generated
}

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]
}

const DOWN = { x: 0, y: -1 }
const LEVEL = { x: 1, y: 0 }

describe('chunk streaming through the worker (ticket 337)', () => {
  const drives = [
    { name: 'down at the bot top speed', speed: BOT_TOP_SPEED, direction: DOWN },
    { name: 'level at the bot top speed', speed: BOT_TOP_SPEED, direction: LEVEL },
    { name: 'down at 480 m/s', speed: 480, direction: DOWN },
    { name: 'level at 480 m/s', speed: 480, direction: LEVEL },
  ]

  for (const { name, speed, direction } of drives) {
    describe(`driving ${name}`, () => {
      const run = stream({ speed, direction, seconds: 10 })

      it('shows no visible chunk unbuilt once the first view is built', () => {
        expect(run.isFirstViewBuilt).toBe(true)
        expect(run.framesWithUnbuiltVisible).toBe(0)
      })

      it('keeps the main thread within 2 ms a frame at p95', () => {
        const p95 = percentile(run.mainMs, 0.95)
        console.log(
          `${name}: main-thread terrain ms p95 ${p95}, longest wait ${Math.max(0, ...run.waits)} frames`,
        )
        expect(p95).toBeLessThanOrEqual(TERRAIN_FRAME_BUDGET_MS)
      })
    })
  }
})
