/**
 * A planted charge's ground is generated before it blows (Technical Director, #154 "prefetch during
 * the fuse"; K6 #189 amendment: from the moment it is planted), so no slice of its live blast ever
 * pays chunk generation: the chunks under its blast and its collapse rim, at most one a tick while
 * the clock moves. Generation is pure and cached, so warming a chunk changes no state and no answer,
 * only when its cost is paid.
 */
import { COLLAPSE_BLOCK_SAMPLES } from '../../../constants/balance'
import { MM_PER_METRE } from '../../../constants/physics'
import { chargeRadiusMm } from '../../economy/chargeSizes'
import type { PlanetParams } from '../../world/planetParams'
import { SAMPLES_PER_TILE } from '../../world/sampleGrid'
import { chunkKey, chunkOfTile, type TilePoint } from '../../world/tileGrid'
import { generatedChunkOf, isGeneratedChunkHeld } from '../../world/worldState'
import type { AuthorityState } from '../authorityState'
import { planetParamsOf } from '../planetOfState'
import { liveChargesOf } from './chargeRules'

export interface ChunkPoint {
  cx: number
  cy: number
}

/**
 * The rim reads blocks whose centre is up to a block past the radius: their far half and the border
 * sample their weakness reads lie within two blocks of it.
 */
const RIM_TILES = (2 * COLLAPSE_BLOCK_SAMPLES) / SAMPLES_PER_TILE

/** Warms at most `ticks` chunks the planted charges' blasts still need. */
export function prefetchPlantedBlastChunks(state: AuthorityState, ticks: number): void {
  const params = planetParamsOf(state.planet)
  if (params === null || ticks <= 0) return
  for (const { cx, cy } of chunksAwaitingPrefetch(state, params).slice(0, ticks)) {
    generatedChunkOf(params, cx, cy)
  }
}

/** The planted charges' blast chunks not generated yet, in charge then row order. */
export function chunksAwaitingPrefetch(state: AuthorityState, params: PlanetParams): ChunkPoint[] {
  const chunks = liveChargesOf(state).flatMap((charge) =>
    blastChunksOf(charge, chargeRadiusMm(charge.size)),
  )
  return uniqueChunks(chunks).filter(({ cx, cy }) => !isGeneratedChunkHeld(params, cx, cy))
}

/** Every chunk a blast of this radius and its collapse rim read, bottom row first. */
export function blastChunksOf(centre: TilePoint, radiusMm: number): ChunkPoint[] {
  const reach = Math.ceil(radiusMm / MM_PER_METRE) + RIM_TILES
  const chunks: ChunkPoint[] = []
  for (let cy = chunkOfTile(centre.ty - reach); cy <= chunkOfTile(centre.ty + reach); cy++) {
    for (let cx = chunkOfTile(centre.tx - reach); cx <= chunkOfTile(centre.tx + reach); cx++) {
      chunks.push({ cx, cy })
    }
  }
  return chunks
}

function uniqueChunks(chunks: readonly ChunkPoint[]): ChunkPoint[] {
  const byKey = new Map(chunks.map((chunk) => [chunkKey(chunk.cx, chunk.cy), chunk]))
  return [...byKey.values()]
}
