import { describe, expect, it } from 'vitest'
import { MAX_SPEED_MM_PER_SECOND } from '../../constants/balance'
import { MM_PER_METRE } from '../../constants/physics'
import {
  CHUNK_STREAM_FRAMES_PER_SECOND,
  TERRAIN_FRAME_BUDGET_MS,
  VIEW_HALF_DIAGONAL_MAX_M,
} from '../../constants/scene'
import type { Vector2 } from '../vehicle/localFrame'
import { CHUNK_SIZE } from '../world/tileGrid'
import { CACHED_CHUNKS } from '../world/worldState'
import { chunkBuildsPerFrame, prefetchLeadSeconds, spendFrameBudget } from './chunkBuildBudget'
import type { ChunkBuildNeed } from './chunkBuilds'
import { chunkFrameWorkOf, type ChunkWork } from './chunkFrameWork'
import { chunksAheadOf } from './chunkPrefetch'
import { haloChunksOf } from './densityHalo'
import { visibleChunksAround, type ChunkPoint } from './visibleChunks'

// The terrain's streaming under a cut every tick (tickets 330 and 336, render): a straight drive at
// the widest zoom from a rig that stood still until its first view was built, the drill staling the
// chunk it is in every frame (an interior cut stales that chunk alone, `isHaloEdgeCurrent`). Each
// frame runs the real rules (prefetch along the velocity, the speed-scaled builds, generation
// before meshes, the 2 ms budget) on modelled costs: the TD's p50s on #316, generation 1.4-2.4 ms
// a chunk and a mesh 1.0-1.2 ms, with the planet's cache as an LRU of `CACHED_CHUNKS` untouched
// chunks.

const FPS = CHUNK_STREAM_FRAMES_PER_SECOND
const PLANET_RADIUS_TILES = 100_000
const START = { x: 16.5, y: 50_000 }
const SETTLE_FRAMES = 2 * FPS
const BOT_TOP_SPEED = MAX_SPEED_MM_PER_SECOND / MM_PER_METRE

interface Costs {
  generateMs: number
  meshMs: number
}

const MID_COSTS: Costs = { generateMs: 1.9, meshMs: 1.1 }
const HIGH_COSTS: Costs = { generateMs: 2.4, meshMs: 1.2 }

interface Drive {
  speed: number
  direction: Vector2
  /** The drill's facing; the direction of travel when left out. */
  facing?: Vector2
  seconds: number
  costs: Costs
}

interface SimChunk {
  builtFrame: number | null
  seenFrame: number | null
  isStale: boolean
}

interface Streaming {
  /** Frames each chunk that came into view on the drive waited for its first build. */
  waits: number[]
  queueLengths: number[]
  /** Modelled terrain milliseconds of each frame on the drive. */
  frameMs: number[]
  isFirstViewBuilt: boolean
  framesWithUnbuiltVisible: number
  drilledRebuilds: number
}

type Need = ChunkBuildNeed

const keyOf = ({ cx, cy }: ChunkPoint) => `${cx},${cy}`

/** The planet's chunk cache: least recent untouched chunks go once more than 64 are held. */
class ModelCache {
  private readonly held = new Set<string>()
  private readonly touched = new Set<string>()

  isGenerated = (cx: number, cy: number) => this.held.has(`${cx},${cy}`)

  touch(chunk: ChunkPoint): void {
    this.touched.add(keyOf(chunk))
    this.read(chunk)
  }

  /** Reads a chunk, generating it when absent; answers whether it had to. */
  read(chunk: ChunkPoint): boolean {
    const key = keyOf(chunk)
    const wasHeld = this.held.delete(key)
    this.held.add(key)
    for (const old of this.held) {
      if (this.held.size - this.touched.size <= CACHED_CHUNKS) break
      if (!this.touched.has(old)) this.held.delete(old)
    }
    return !wasHeld
  }
}

function stream(drive: Drive): Streaming {
  const chunks = new Map<string, SimChunk>()
  const cache = new ModelCache()
  const streaming: Streaming = {
    waits: [],
    queueLengths: [],
    frameMs: [],
    isFirstViewBuilt: false,
    framesWithUnbuiltVisible: 0,
    drilledRebuilds: 0,
  }
  let queueLength = 0
  const lastFrame = SETTLE_FRAMES + drive.seconds * FPS
  for (let frame = 1; frame <= lastFrame; frame++) {
    const isDriving = frame > SETTLE_FRAMES
    const travelled = isDriving ? (drive.speed * (frame - SETTLE_FRAMES)) / FPS : 0
    const centre = {
      x: START.x + drive.direction.x * travelled,
      y: START.y + drive.direction.y * travelled,
    }
    const speed = isDriving ? drive.speed : 0
    const builds = chunkBuildsPerFrame(speed, VIEW_HALF_DIAGONAL_MAX_M)
    const visible = visibleChunksAround(centre, VIEW_HALF_DIAGONAL_MAX_M, PLANET_RADIUS_TILES)
    const ahead = chunksAheadOf({
      centre,
      viewRadius: VIEW_HALF_DIAGONAL_MAX_M,
      velocity: { x: drive.direction.x * speed, y: drive.direction.y * speed },
      facing: drive.facing ?? drive.direction,
      leadSeconds: prefetchLeadSeconds(queueLength, builds),
      planetRadiusTiles: PLANET_RADIUS_TILES,
    })
    const drilled = { cx: Math.floor(centre.x / CHUNK_SIZE), cy: Math.floor(centre.y / CHUNK_SIZE) }
    for (const chunk of visible) noteSeen(chunks, chunk, isDriving ? frame : 0)
    cache.touch(drilled)
    staleChunk(chunks, keyOf(drilled))
    const needs = [
      ...visible.flatMap((chunk) => needOf(chunks, chunk, true)),
      ...ahead.flatMap((chunk) => needOf(chunks, chunk, false)),
    ]
    queueLength = needs.length
    const work = chunkFrameWorkOf(needs, frame, builds, cache.isGenerated)
    let frameMs = 0
    spendFrameBudget(
      work.items,
      (item) => {
        const costMs = runItem(item, {
          chunks,
          cache,
          frame,
          streaming,
          drilled,
          costs: drive.costs,
        })
        frameMs += costMs
        return costMs
      },
      TERRAIN_FRAME_BUDGET_MS,
    )
    const hasUnbuilt = visible.some((chunk) => chunks.get(keyOf(chunk))?.builtFrame === null)
    if (isDriving) {
      streaming.queueLengths.push(needs.length)
      streaming.frameMs.push(frameMs)
      if (hasUnbuilt) streaming.framesWithUnbuiltVisible++
    } else {
      streaming.isFirstViewBuilt ||= !hasUnbuilt
    }
  }
  return streaming
}

interface FrameRun {
  chunks: Map<string, SimChunk>
  cache: ModelCache
  frame: number
  streaming: Streaming
  drilled: ChunkPoint
  costs: Costs
}

/** Runs one item on the model and answers its cost; a build generates what its halo lacks. */
function runItem(item: ChunkWork<Need>, run: FrameRun): number {
  const { generateMs, meshMs } = run.costs
  if (item.kind === 'generate') return run.cache.read(item.chunk) ? generateMs : 0
  const generated = haloChunksOf(item.need.cx, item.need.cy).filter((chunk) =>
    run.cache.read(chunk),
  )
  buildChunk(run, item.need)
  return meshMs + generated.length * generateMs
}

function chunkAt(chunks: Map<string, SimChunk>, key: string): SimChunk {
  const known = chunks.get(key) ?? { builtFrame: null, seenFrame: null, isStale: false }
  chunks.set(key, known)
  return known
}

function noteSeen(chunks: Map<string, SimChunk>, chunk: ChunkPoint, frame: number): void {
  chunkAt(chunks, keyOf(chunk)).seenFrame ??= frame
}

function staleChunk(chunks: Map<string, SimChunk>, key: string): void {
  const chunk = chunks.get(key)
  if (chunk !== undefined && chunk.builtFrame !== null) chunk.isStale = true
}

function needOf(chunks: Map<string, SimChunk>, point: ChunkPoint, isVisible: boolean): Need[] {
  const key = keyOf(point)
  const chunk = chunkAt(chunks, key)
  const isBuilt = chunk.builtFrame !== null
  if (isBuilt && !chunk.isStale) return []
  return [
    { key, cx: point.cx, cy: point.cy, isVisible, isBuilt, builtFrame: chunk.builtFrame ?? 0 },
  ]
}

function buildChunk(run: FrameRun, need: Need): void {
  const chunk = chunkAt(run.chunks, need.key)
  const isSeenOnTheDrive = chunk.seenFrame !== null && chunk.seenFrame > 0
  if (chunk.builtFrame === null && isSeenOnTheDrive) {
    run.streaming.waits.push(run.frame - (chunk.seenFrame ?? run.frame))
  }
  const isDrilledRebuild = need.isBuilt && need.key === keyOf(run.drilled)
  if (isDrilledRebuild && run.frame > SETTLE_FRAMES) run.streaming.drilledRebuilds++
  chunk.builtFrame = run.frame
  chunk.isStale = false
}

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]
}

const DOWN = { x: 0, y: -1 }
const LEVEL = { x: 1, y: 0 }
const UP = { x: 0, y: 1 }
const DIAGONAL = { x: Math.SQRT1_2, y: -Math.SQRT1_2 }

describe('chunk streaming under the swept cut (ticket 330)', () => {
  const descent = stream({ speed: 7.5, direction: DOWN, seconds: 30, costs: MID_COSTS })

  it('logs the stale-chunk queue over a 30 s straight descent', () => {
    const { queueLengths } = descent
    const mean = queueLengths.reduce((sum, length) => sum + length, 0) / queueLengths.length
    console.log(`stale-chunk queue over 30 s: max ${Math.max(...queueLengths)}, mean ${mean}`)
    expect(queueLengths).toHaveLength(30 * FPS)
  })

  it('builds no chunk that comes into view more than 4 frames after it does', () => {
    expect(Math.max(0, ...descent.waits)).toBeLessThanOrEqual(4)
  })

  it('shows no frame with an unbuilt visible chunk once the first view is built', () => {
    expect(descent.isFirstViewBuilt).toBe(true)
    expect(descent.framesWithUnbuiltVisible).toBe(0)
  })

  it('rebuilds the drilled chunk at most once every 4 frames, 15 times a second', () => {
    expect(descent.drilledRebuilds).toBeGreaterThan(0)
    expect(descent.drilledRebuilds).toBeLessThanOrEqual((30 * FPS) / 4)
  })
})

describe('chunk streaming at speed (ticket 336)', () => {
  const drives = [
    { name: 'down at the bot top speed', speed: BOT_TOP_SPEED, direction: DOWN },
    { name: 'level at the bot top speed', speed: BOT_TOP_SPEED, direction: LEVEL },
    { name: 'down at 120 m/s', speed: 120, direction: DOWN },
    { name: 'level at 120 m/s', speed: 120, direction: LEVEL },
    { name: 'diagonally at 120 m/s', speed: 120, direction: DIAGONAL },
    // Travel the drill does not face, where ticket 330's prefetch along the facing builds nothing.
    { name: 'up the shaft at 120 m/s facing right', speed: 120, direction: UP, facing: LEVEL },
    { name: 'falling at 120 m/s facing right', speed: 120, direction: DOWN, facing: LEVEL },
  ]

  for (const { name, speed, direction, facing } of drives) {
    describe(`driving ${name}`, () => {
      const mid = stream({ speed, direction, facing, seconds: 10, costs: MID_COSTS })
      const high = stream({ speed, direction, facing, seconds: 10, costs: HIGH_COSTS })

      it('shows no visible chunk unbuilt once the first view is built', () => {
        expect(mid.isFirstViewBuilt).toBe(true)
        expect(mid.framesWithUnbuiltVisible).toBe(0)
        expect(high.framesWithUnbuiltVisible).toBe(0)
      })

      it('builds every newly visible chunk within 4 frames of it coming into view', () => {
        expect(Math.max(0, ...mid.waits)).toBeLessThanOrEqual(4)
        expect(Math.max(0, ...high.waits)).toBeLessThanOrEqual(4)
      })

      it('keeps the terrain within 2 ms a frame at p95 on the mid p50 costs', () => {
        const p95 = percentile(mid.frameMs, 0.95)
        console.log(`${name}: terrain ms p95 ${p95}, max queue ${Math.max(...mid.queueLengths)}`)
        expect(p95).toBeLessThanOrEqual(TERRAIN_FRAME_BUDGET_MS)
      })
    })
  }
})
