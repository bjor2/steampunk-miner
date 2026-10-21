/**
 * How deep play has opened the planet (ticket 703, the save slot line): the deepest cell whose yield
 * bit is set, in the run log's `depthTiles` measure (`depthTilesAt`, one tile is one metre, #7),
 * so the slot line shows the same depth the HUD does. Read off the chunk deltas alone: a yielded
 * cell is open ground for every rule (#36), and a planet's deltas are emptied on every arrival.
 */
import type { ChunkDelta } from './chunkDelta'
import { depthTilesAt } from './planetGeometry'
import type { PlanetParams } from './planetParams'
import { CHUNK_SIZE, firstTileOfChunk, surfaceRowOfColumn } from './tileGrid'

/** Whole metres below the surface of the deepest yielded cell; 0 before any cell yields. */
export function deepestOpenedDepthOf(
  params: PlanetParams,
  chunks: Readonly<Record<string, ChunkDelta>>,
): number {
  const depthOfTile = depthReaderOf(params)
  return Object.entries(chunks).reduce(
    (deepest, [key, delta]) => Math.max(deepest, deepestYieldIn(key, delta, depthOfTile)),
    0,
  )
}

/** The depth of the core's top tile on the dock column (x = 0): the surface-to-core span. */
export function coreDepthOf(params: PlanetParams): number {
  return depthTilesAt(params, 0, surfaceRowOfColumn(0, params.coreRadiusTiles))
}

type DepthOfTile = (tx: number, ty: number) => number

/** `depthTilesAt` with each column's surface row looked up once: a deep save holds many cells. */
function depthReaderOf(params: PlanetParams): DepthOfTile {
  const surfaceRows = new Map<number, number>()
  return (tx, ty) => {
    if (!surfaceRows.has(tx)) surfaceRows.set(tx, surfaceRowOfColumn(tx, params.radiusTiles))
    return Math.max(0, (surfaceRows.get(tx) as number) - ty)
  }
}

function deepestYieldIn(key: string, delta: ChunkDelta, depthOfTile: DepthOfTile): number {
  const [cx, cy] = key.split(',').map(Number)
  let deepest = 0
  delta.yieldedRows.forEach((word, ly) => {
    if (word === 0) return
    const ty = firstTileOfChunk(cy) + ly
    for (const lx of setBitsOf(word)) {
      deepest = Math.max(deepest, depthOfTile(firstTileOfChunk(cx) + lx, ty))
    }
  })
  return deepest
}

/** The bit positions set in a 32-bit yield row word, lowest first. */
function setBitsOf(word: number): number[] {
  const bits: number[] = []
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    if (((word >>> lx) & 1) === 1) bits.push(lx)
  }
  return bits
}
