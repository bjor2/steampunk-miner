import { describe, expect, it } from 'vitest'
import { CHUNK_BUILDS_PER_FRAME, VIEW_HALF_DIAGONAL_MAX_M } from '../../constants/scene'
import { CHUNK_SIZE } from '../world/tileGrid'
import { chunksToBuild, type ChunkBuildNeed } from './chunkBuilds'
import { chunksAheadOf } from './chunkPrefetch'
import { visibleChunksAround } from './visibleChunks'

// The terrain's build order under a cut every tick (ticket 330 acceptance, render): a 30 s
// straight descent at 7.5 cells a second, at the widest zoom, one build a frame, the drill staling
// the chunk it is in every frame (an interior cut stales that chunk alone, `isHaloEdgeCurrent`).

const FPS = 60
const SECONDS = 30
const CELLS_PER_SECOND = 7.5
const PLANET_RADIUS_TILES = 100_000
const START = { x: 16.5, y: 50_000 }
const DOWN = { x: 0, y: -1 }

interface SimChunk {
  builtFrame: number | null
  /** The frame it first came into view, or null while it has not. */
  seenFrame: number | null
  isStale: boolean
}

interface Descent {
  /** Frames each chunk waited between coming into view and its first build, past the first view. */
  waits: number[]
  queueLengths: number[]
  /** Frames after the first view was complete that showed a visible chunk with no mesh. */
  framesWithUnbuiltVisible: number
  drilledRebuilds: number
}

type Need = ChunkBuildNeed & { key: string }

const keyOf = ({ cx, cy }: { cx: number; cy: number }) => `${cx},${cy}`

function descend(): Descent {
  const chunks = new Map<string, SimChunk>()
  const descent: Descent = {
    waits: [],
    queueLengths: [],
    framesWithUnbuiltVisible: 0,
    drilledRebuilds: 0,
  }
  let isFirstViewBuilt = false
  for (let frame = 1; frame <= SECONDS * FPS; frame++) {
    const centre = { x: START.x, y: START.y - (CELLS_PER_SECOND * frame) / FPS }
    const visible = visibleChunksAround(centre, VIEW_HALF_DIAGONAL_MAX_M, PLANET_RADIUS_TILES).map(
      keyOf,
    )
    const ahead = chunksAheadOf(centre, VIEW_HALF_DIAGONAL_MAX_M, DOWN, PLANET_RADIUS_TILES).map(
      keyOf,
    )
    const drilled = keyOf({ cx: 0, cy: Math.floor(centre.y / CHUNK_SIZE) })
    for (const key of visible) noteSeen(chunks, key, frame)
    staleChunk(chunks, drilled)
    const needs = [
      ...visible.flatMap((key) => needOf(chunks, key, true)),
      ...ahead.flatMap((key) => needOf(chunks, key, false)),
    ]
    descent.queueLengths.push(needs.length)
    for (const need of chunksToBuild(needs, frame, CHUNK_BUILDS_PER_FRAME)) {
      buildChunk(chunks, need, frame, descent)
      if (need.key === drilled && need.isBuilt) descent.drilledRebuilds++
    }
    const hasUnbuilt = visible.some((key) => chunks.get(key)?.builtFrame === null)
    if (isFirstViewBuilt && hasUnbuilt) descent.framesWithUnbuiltVisible++
    isFirstViewBuilt ||= !hasUnbuilt
  }
  return descent
}

function chunkAt(chunks: Map<string, SimChunk>, key: string): SimChunk {
  const known = chunks.get(key) ?? { builtFrame: null, seenFrame: null, isStale: false }
  chunks.set(key, known)
  return known
}

function noteSeen(chunks: Map<string, SimChunk>, key: string, frame: number): void {
  const chunk = chunkAt(chunks, key)
  chunk.seenFrame ??= frame
}

function staleChunk(chunks: Map<string, SimChunk>, key: string): void {
  const chunk = chunks.get(key)
  if (chunk !== undefined && chunk.builtFrame !== null) chunk.isStale = true
}

function needOf(chunks: Map<string, SimChunk>, key: string, isVisible: boolean): Need[] {
  const chunk = chunkAt(chunks, key)
  const isBuilt = chunk.builtFrame !== null
  if (isBuilt && !chunk.isStale) return []
  return [{ key, isVisible, isBuilt, builtFrame: chunk.builtFrame ?? 0 }]
}

function buildChunk(chunks: Map<string, SimChunk>, need: Need, frame: number, descent: Descent) {
  const chunk = chunkAt(chunks, need.key)
  if (chunk.builtFrame === null && chunk.seenFrame !== null && chunk.seenFrame > 1) {
    descent.waits.push(frame - chunk.seenFrame)
  }
  chunk.builtFrame = frame
  chunk.isStale = false
}

describe('chunk streaming under the swept cut (ticket 330)', () => {
  const descent = descend()

  it('logs the stale-chunk queue over a 30 s straight descent', () => {
    const { queueLengths } = descent
    const mean = queueLengths.reduce((sum, length) => sum + length, 0) / queueLengths.length
    console.log(`stale-chunk queue over 30 s: max ${Math.max(...queueLengths)}, mean ${mean}`)
    expect(queueLengths).toHaveLength(SECONDS * FPS)
  })

  it('builds no chunk that comes into view more than 4 frames after it does', () => {
    expect(Math.max(...descent.waits)).toBeLessThanOrEqual(4)
  })

  it('shows no frame with an unbuilt visible chunk once the first view is built', () => {
    expect(descent.framesWithUnbuiltVisible).toBe(0)
  })

  it('rebuilds the drilled chunk at most once every 4 frames, 15 times a second', () => {
    expect(descent.drilledRebuilds).toBeGreaterThan(0)
    expect(descent.drilledRebuilds).toBeLessThanOrEqual((SECONDS * FPS) / 4)
  })
})
