/**
 * One frame of the terrain's chunk streaming (TD scope c1 on #316, ticket 336): the frame's work
 * from `chunkFrameWorkOf` (generation, then meshes in view, then on the drive line, as many builds
 * as the speed asks for), run in order on the main thread's clock until the 2 ms of #4 are spent.
 * Generation fills the planet's chunk cache; a build is the pool's. Split from `chunkMeshPool.ts`.
 */
import { TERRAIN_FRAME_BUDGET_MS } from '../constants/scene'
import { chunkBuildsPerFrame, spendFrameBudget } from '../systems/render/chunkBuildBudget'
import type { ChunkBuildNeed } from '../systems/render/chunkBuilds'
import { chunkFrameWorkOf, type ChunkWork } from '../systems/render/chunkFrameWork'
import type { Vector2 } from '../systems/vehicle/localFrame'
import type { PlanetParams } from '../systems/world/planetParams'
import { generatedChunkOf, isGeneratedChunkHeld } from '../systems/world/worldState'

/** What the streaming reads of the terrain's view. */
export interface StreamView {
  params: PlanetParams
  viewRadius: number
  /** The rig's velocity, metres a second. */
  velocity: Vector2
}

/** Runs the frame's work under the budget; true when every need was built. */
export function streamChunkFrame<N extends ChunkBuildNeed>(
  needs: readonly N[],
  frame: number,
  view: StreamView,
  build: (need: N) => void,
): boolean {
  const work = chunkFrameWorkOf(needs, frame, buildsPerFrameOf(view), isGeneratedOn(view.params))
  const runTimed = (item: ChunkWork<N>) => timedMs(() => runChunkWork(view.params, item, build))
  const ran = spendFrameBudget(work.items, runTimed, TERRAIN_FRAME_BUDGET_MS)
  return work.isEveryNeedPlanned && ran === work.items.length
}

/** Chunk builds the frame may run at the rig's speed and the view's radius. */
export function buildsPerFrameOf(view: StreamView): number {
  return chunkBuildsPerFrame(Math.hypot(view.velocity.x, view.velocity.y), view.viewRadius)
}

function isGeneratedOn(params: PlanetParams): (cx: number, cy: number) => boolean {
  return (cx, cy) => isGeneratedChunkHeld(params, cx, cy)
}

/** The milliseconds `run` took: the budget is spent on the main thread's own clock. */
function timedMs(run: () => void): number {
  const started = performance.now()
  run()
  return performance.now() - started
}

function runChunkWork<N extends ChunkBuildNeed>(
  params: PlanetParams,
  item: ChunkWork<N>,
  build: (need: N) => void,
): void {
  if (item.kind === 'generate') generatedChunkOf(params, item.chunk.cx, item.chunk.cy)
  else build(item.need)
}
