/**
 * The terrain's work for one frame, in order (TD scope c1 on #316, ticket 336): generation first,
 * then the meshes of chunks in view, then those on the drive line. The meshes are the ones
 * `chunksToBuild` picks, at most `buildsPerFrame`; the generation is the chunks their density
 * halos read that the planet's cache does not hold yet. A cold chunk then costs a generation in one
 * frame and a mesh build in a later one instead of both in the same frame. The caller runs the
 * items under the frame budget (`spendFrameBudget`); what it leaves is planned again next frame.
 */
import { chunksToBuild, type ChunkBuildNeed } from './chunkBuilds'
import { haloChunksOf } from './densityHalo'
import type { ChunkPoint } from './visibleChunks'

export type ChunkWork<N extends ChunkBuildNeed> =
  { kind: 'generate'; chunk: ChunkPoint } | { kind: 'build'; need: N }

export interface ChunkFrameWork<N extends ChunkBuildNeed> {
  items: ChunkWork<N>[]
  /** Every need is in `items`: once they all run, nothing visible or ahead is left to build. */
  isEveryNeedPlanned: boolean
}

/** Whether the planet's cache holds a chunk's cells and density now. */
export type IsChunkGenerated = (cx: number, cy: number) => boolean

export function chunkFrameWorkOf<N extends ChunkBuildNeed>(
  needs: readonly N[],
  frame: number,
  buildsPerFrame: number,
  isGenerated: IsChunkGenerated,
): ChunkFrameWork<N> {
  const builds = chunksToBuild(needs, frame, buildsPerFrame)
  const items: ChunkWork<N>[] = [
    ...generationFor(builds, isGenerated),
    ...builds.map((need) => ({ kind: 'build' as const, need })),
  ]
  return { items, isEveryNeedPlanned: builds.length === needs.length }
}

/** The chunks the builds' halos read and the cache lacks, each once, in build order. */
function generationFor<N extends ChunkBuildNeed>(
  builds: readonly N[],
  isGenerated: IsChunkGenerated,
): ChunkWork<N>[] {
  const planned = new Set<string>()
  const work: ChunkWork<N>[] = []
  for (const chunk of builds.flatMap(({ cx, cy }) => haloChunksOf(cx, cy))) {
    const key = `${chunk.cx},${chunk.cy}`
    if (planned.has(key) || isGenerated(chunk.cx, chunk.cy)) continue
    planned.add(key)
    work.push({ kind: 'generate', chunk })
  }
  return work
}
