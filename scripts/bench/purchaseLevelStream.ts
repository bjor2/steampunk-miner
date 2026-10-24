/**
 * The terrain's chunk streaming over one pass of a `bench:purchase-levels` row (ticket 840), as
 * `streamAtSpeed.ts` runs it (ticket 336): the chunks in view of the rig and ahead along its
 * velocity, generated and built on the main thread with real generation and real tile batches, the
 * drilled chunks rebuilt from the authority's own world as the cut changes it. Generation runs on
 * the main thread here; the live client builds in the worker (ticket 337), so a wait here is an
 * upper bound.
 *
 * A frame composes `streamChunkFrame` (`scene/chunkStreamFrame.ts`) from its own exported steps,
 * with one change: the 2 ms budget is spent at `TERRAIN_FRAME_BUDGET_MS / cpuSlowdown` of this
 * machine's time, which is what the budget buys on a CPU that many times slower. Desktop's
 * slowdown is 1, so its frame is the scene's exactly.
 */
import { performance } from 'node:perf_hooks'
import { TERRAIN_FRAME_BUDGET_MS } from '../../src/constants/scene'
import { buildsPerFrameOf, timedMs } from '../../src/scene/chunkStreamFrame'
import { prefetchLeadSeconds, spendFrameBudget } from '../../src/systems/render/chunkBuildBudget'
import type { ChunkBuildNeed } from '../../src/systems/render/chunkBuilds'
import { chunkFrameWorkOf, type ChunkWork } from '../../src/systems/render/chunkFrameWork'
import { chunksAheadOf } from '../../src/systems/render/chunkPrefetch'
import { buildChunkTileBatch } from '../../src/systems/render/chunkTileBatch'
import {
  chunkViewVersionOf,
  isSameChunkView,
  type ChunkViewVersion,
} from '../../src/systems/render/chunkViewVersion'
import { chunkDensityHaloOf } from '../../src/systems/render/densityHalo'
import { visibleChunksAround, type ChunkPoint } from '../../src/systems/render/visibleChunks'
import type { Vector2 } from '../../src/systems/vehicle/localFrame'
import type { PlanetParams } from '../../src/systems/world/planetParams'
import { CHUNK_SIZE, chunkKey } from '../../src/systems/world/tileGrid'
import {
  currentDensityOfChunk,
  generatedChunkOf,
  isGeneratedChunkHeld,
  materialCellsOfChunk,
  type WorldState,
} from '../../src/systems/world/worldState'

/** Frames at rest the first view may take to build before the pass gives up. */
const SETTLE_FRAMES_MAX = 600

interface BuiltChunk {
  builtFrame: number
  version: ChunkViewVersion
}

interface StreamNeed extends ChunkBuildNeed {
  version: ChunkViewVersion
}

export interface StreamPass {
  params: PlanetParams
  viewRadius: number
  budgetMs: number
  built: Map<string, BuiltChunk>
  frame: number
  queueLength: number
  /** The rig's run of frames ahead of its built chunks so far. */
  aheadRun: number
}

/** What the terrain did in one frame. */
export interface StreamFrameReading {
  /** The frame's terrain work on this machine's clock, ms. */
  terrainMs: number
  generated: number
  builds: number
  /** The chunk the rig's body or its cut front stands in has no mesh. */
  isRigAhead: boolean
  /** Frames in a row the rig has been ahead, this one included. */
  aheadRun: number
  /** Every visible and ahead chunk was built this frame. */
  isComplete: boolean
}

/** Where the rig is this frame and the world the authority left. */
export interface StreamFrameView {
  centre: Vector2
  /** m/s. */
  velocity: Vector2
  facing: Vector2
  world: WorldState
  /** The points whose chunks must hold a mesh: the body and the cut's front. */
  rigPoints: readonly Vector2[]
}

export function createStreamPass(
  params: PlanetParams,
  viewRadius: number,
  cpuSlowdown: number,
): StreamPass {
  const budgetMs = TERRAIN_FRAME_BUDGET_MS / cpuSlowdown
  return { params, viewRadius, budgetMs, built: new Map(), frame: 0, queueLength: 0, aheadRun: 0 }
}

/** Frames at rest until the first view is built; not part of any row's numbers. */
export function settleStreamPass(pass: StreamPass, view: StreamFrameView): number {
  for (let frame = 1; frame <= SETTLE_FRAMES_MAX; frame++) {
    if (streamFrame(pass, view).isComplete) return frame
  }
  throw new Error(`the first view on planet ${pass.params.planetIndex} never finished building`)
}

export function streamFrame(pass: StreamPass, view: StreamFrameView): StreamFrameReading {
  pass.frame++
  const tally = { generated: 0, builds: 0 }
  const started = performance.now()
  const isComplete = runFrameWork(pass, view, tally)
  const terrainMs = performance.now() - started
  const isRigAhead = isRigAheadOfMeshes(pass, view.rigPoints)
  pass.aheadRun = isRigAhead ? pass.aheadRun + 1 : 0
  return { terrainMs, ...tally, isRigAhead, aheadRun: pass.aheadRun, isComplete }
}

/** `streamChunkFrame`'s steps under the profile's budget; true when every need was built. */
function runFrameWork(
  pass: StreamPass,
  view: StreamFrameView,
  tally: { generated: number; builds: number },
): boolean {
  const streamView = { params: pass.params, viewRadius: pass.viewRadius, velocity: view.velocity }
  const needs = needsAt(pass, view)
  pass.queueLength = needs.length
  const isGenerated = (cx: number, cy: number) => isGeneratedChunkHeld(pass.params, cx, cy)
  const work = chunkFrameWorkOf(needs, pass.frame, buildsPerFrameOf(streamView), isGenerated)
  const runTimed = (item: ChunkWork<StreamNeed>) =>
    timedMs(() => runChunkWork(pass, view.world, item, tally))
  const ran = spendFrameBudget(work.items, runTimed, pass.budgetMs)
  return work.isEveryNeedPlanned && ran === work.items.length
}

/** The visible chunks, then those ahead along the velocity, whose mesh is missing or stale. */
function needsAt(pass: StreamPass, view: StreamFrameView): StreamNeed[] {
  const radius = pass.params.radiusTiles
  const streamView = { params: pass.params, viewRadius: pass.viewRadius, velocity: view.velocity }
  const visible = visibleChunksAround(view.centre, pass.viewRadius, radius)
  const ahead = chunksAheadOf({
    centre: view.centre,
    viewRadius: pass.viewRadius,
    velocity: view.velocity,
    facing: view.facing,
    leadSeconds: prefetchLeadSeconds(pass.queueLength, buildsPerFrameOf(streamView)),
    planetRadiusTiles: radius,
  })
  return [
    ...visible.flatMap((chunk) => needOf(pass, view.world, chunk, true)),
    ...ahead.flatMap((chunk) => needOf(pass, view.world, chunk, false)),
  ]
}

function needOf(
  pass: StreamPass,
  world: WorldState,
  { cx, cy }: ChunkPoint,
  isVisible: boolean,
): StreamNeed[] {
  const key = chunkKey(cx, cy)
  const version = chunkViewVersionOf(world, cx, cy)
  const built = pass.built.get(key)
  if (built !== undefined && isSameChunkView(built.version, version)) return []
  const builtFrame = built?.builtFrame ?? 0
  return [{ key, cx, cy, isVisible, isBuilt: built !== undefined, builtFrame, version }]
}

function runChunkWork(
  pass: StreamPass,
  world: WorldState,
  item: ChunkWork<StreamNeed>,
  tally: { generated: number; builds: number },
): void {
  if (item.kind === 'generate') {
    generatedChunkOf(pass.params, item.chunk.cx, item.chunk.cy)
    tally.generated++
    return
  }
  buildChunk(pass, world, item.need)
  tally.builds++
}

/** What the pool's build does on the CPU: the density halo and the tile batch. */
function buildChunk(pass: StreamPass, world: WorldState, need: StreamNeed): void {
  const { params } = pass
  const densityOf = (x: number, y: number) => currentDensityOfChunk(world, params, x, y)
  const halo = chunkDensityHaloOf(densityOf, need.cx, need.cy)
  const cells = materialCellsOfChunk(world, params, need.cx, need.cy)
  buildChunkTileBatch(params, need.cx, need.cy, cells, halo)
  pass.built.set(need.key, { builtFrame: pass.frame, version: need.version })
}

function isRigAheadOfMeshes(pass: StreamPass, points: readonly Vector2[]): boolean {
  return points.some((point) => !pass.built.has(chunkKeyOfPoint(point)))
}

function chunkKeyOfPoint({ x, y }: Vector2): string {
  return chunkKey(Math.floor(x / CHUNK_SIZE), Math.floor(y / CHUNK_SIZE))
}
