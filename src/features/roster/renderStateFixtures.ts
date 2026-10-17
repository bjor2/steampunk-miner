/**
 * The render-state digest of ticket 450 (TD acceptance on #450: "old-save planets (no roster)
 * render exactly as today, digest of the render state, not pixels"): every instance array a strip
 * of chunk meshes hands the terrain shader, from the surface through every band to the core,
 * digested the way main's frozen digest was taken before the kind look landed. The kind array the
 * look added is digested apart, so the arrays main drew can be compared on their own. Only specs
 * use it.
 */
import { fnv1a64Hex } from '../../systems/authority/stateDigest'
import { buildChunkMeshParts } from '../../systems/render/chunkMeshParts'
import type { ChunkTileBatch } from '../../systems/render/chunkTileBatch'
import type { PlanetParams } from '../../systems/world/planetParams'
import { chunkRangeOfDisc } from '../../systems/world/tileGrid'
import { EMPTY_WORLD } from '../../systems/world/worldState'

/** The strip's two chunk columns either side of the planet's x = 0 axis, top to bottom. */
const STRIP_COLUMNS = [-1, 0]

export interface RenderStateDigest {
  /** Tiles, base and ore colours, styles, gate bits and block starts: what main drew. */
  drawn: string
  /** Every kind slot the strip's tiles carry, 0 where none. */
  kindSlots: readonly number[]
}

export function renderStateDigestOf(params: PlanetParams): RenderStateDigest {
  const batches = stripBatchesOf(params)
  return {
    drawn: fnv1a64Hex(batches.map(drawnArraysTextOf).join('|')),
    kindSlots: [...new Set(batches.flatMap(kindSlotsOf))].sort((a, b) => a - b),
  }
}

function stripBatchesOf(params: PlanetParams): ChunkTileBatch[] {
  const { min, max } = chunkRangeOfDisc(params.radiusTiles)
  const batches: ChunkTileBatch[] = []
  for (let cy = max; cy >= min; cy--) {
    for (const cx of STRIP_COLUMNS) {
      batches.push(buildChunkMeshParts(params, EMPTY_WORLD, cx, cy).batch)
    }
  }
  return batches
}

function drawnArraysTextOf(batch: ChunkTileBatch): string {
  return [
    batch.tiles.subarray(0, batch.count * 2),
    batch.baseColours.subarray(0, batch.count * 3),
    batch.oreColours.subarray(0, batch.count * 4),
    batch.styles.subarray(0, batch.count * 4),
    batch.gates.subarray(0, batch.count),
    batch.blockStarts,
  ]
    .map((values) => Array.from(values).join(','))
    .join(';')
}

function kindSlotsOf(batch: ChunkTileBatch): number[] {
  return Array.from(batch.kinds.subarray(0, batch.count))
}
