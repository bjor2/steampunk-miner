/**
 * Which chunk meshes a frame builds (#4: terrain updates under 2 ms a frame, at most
 * `CHUNK_BUILDS_PER_FRAME`; TD scope on #316, ticket 330). Of the chunks that need a build,
 * nearest first within each group:
 *
 * 1. visible chunks with no mesh yet, so a chunk coming into view waits only on other new ones;
 * 2. visible chunks whose mesh is stale, each at most once in `CHUNK_REBUILD_MIN_FRAMES` frames,
 *    so a chunk the drill cuts every tick cannot take every build;
 * 3. chunks ahead of the view (`chunkPrefetch`), built early on the same terms.
 *
 * A chunk left out keeps its need and is asked again next frame.
 */
import { CHUNK_REBUILD_MIN_FRAMES } from '../../constants/scene'

/** A chunk that needs a build, as the frame sees it. */
export interface ChunkBuildNeed {
  key: string
  isVisible: boolean
  /** It has a mesh now (a stale one). */
  isBuilt: boolean
  /** The frame its mesh was built in; meaningless when it has none. */
  builtFrame: number
}

/** The needs this frame builds, at most `budget`, in build order; `needs` come nearest first. */
export function chunksToBuild<N extends ChunkBuildNeed>(
  needs: readonly N[],
  frame: number,
  budget: number,
): N[] {
  const isCooled = (need: N) => !need.isBuilt || frame - need.builtFrame >= CHUNK_REBUILD_MIN_FRAMES
  const newlyVisible = needs.filter((need) => need.isVisible && !need.isBuilt)
  const staleVisible = needs.filter((need) => need.isVisible && need.isBuilt && isCooled(need))
  const ahead = needs.filter((need) => !need.isVisible && isCooled(need))
  return [...newlyVisible, ...staleVisible, ...ahead].slice(0, budget)
}
