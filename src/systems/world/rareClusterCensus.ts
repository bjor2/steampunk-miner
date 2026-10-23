/**
 * The rare-cluster census of a whole generated planet (ticket 737's 5-seed report): every cluster
 * is a connected run of one rare ore cell (rare, epic or mythic, `isRareOreCell`) within one band,
 * read from `generateChunk`'s cells. Rarity counts the clusters, money counts the cells. Pure and
 * deterministic; a whole planet takes a few seconds, so specs read a handful.
 */
import { fnv1a64Hex } from '../authority/stateDigest'
import { chunkDigest } from './chunkDigest'
import { generateChunk } from './generateChunk'
import { guaranteedClusterTiles } from './guaranteedClusters'
import { bandPatchesInBox } from './orePatches'
import { patchCellOf } from './patchCell'
import type { PlanetParams } from './planetParams'
import { BAND_COUNT, bandOfTile } from './planetGeometry'
import { DEEP_RARE_FIRST_BAND } from './planetTable'
import { isRareOreCell, oreTilesOfPatch, tileKeyOf } from './rareClusters'
import {
  cellIndexOfTile,
  chunkKey,
  chunkOfTile,
  chunkRangeOfDisc,
  firstTileOfChunk,
  type TilePoint,
} from './tileGrid'
import { kindSlotOfCell } from './worldCell'

export interface RareCluster {
  band: number
  cell: number
  tiles: readonly TilePoint[]
}

export interface RareClusterCensus {
  clusters: readonly RareCluster[]
  /** Every chunk's digest in row order: the same seed must give the same bytes. */
  digest: string
}

interface PlanetCells {
  params: PlanetParams
  chunks: ReadonlyMap<string, Uint32Array>
  digest: string
}

export function rareClusterCensusOf(params: PlanetParams): RareClusterCensus {
  const planet = generatedPlanetOf(params)
  return { clusters: rareClustersOf(planet), digest: planet.digest }
}

/** The clusters whose band may grow them (`d >= 0.35`): the size histogram's population. */
export function deepClustersOf(census: RareClusterCensus): RareCluster[] {
  return census.clusters.filter((cluster) => cluster.band >= DEEP_RARE_FIRST_BAND)
}

/** Clusters of 1, 2, 3 and more cells, in percent of the clusters, one decimal. */
export function sizeSharesPercentOf(clusters: readonly RareCluster[]): number[] {
  const counts = [0, 0, 0, 0]
  for (const cluster of clusters) counts[Math.min(cluster.tiles.length, 4) - 1]++
  return counts.map((count) => Math.round((1000 * count) / clusters.length) / 10)
}

/** The kind slots the planet holds a rare cluster of. */
export function rareKindSlotsOf(census: RareClusterCensus): Set<number> {
  return new Set(census.clusters.map((cluster) => kindSlotOfCell(cluster.cell)))
}

/**
 * Every cluster the step grows on the planet, as it means to paint it: each rare patch's cluster
 * (none where its seed is taken), then each guaranteed cluster.
 */
export function grownClustersOf(params: PlanetParams): (readonly TilePoint[])[] {
  return [...patchClustersOf(params), ...guaranteedClustersOf(params)]
}

function patchClustersOf(params: PlanetParams): (readonly TilePoint[])[] {
  const r = params.radiusTiles
  const box = { x0: -r, y0: -r, x1: r, y1: r }
  const clusters: (readonly TilePoint[])[] = []
  for (let band = 1; band <= BAND_COUNT; band++) {
    for (const patch of bandPatchesInBox(params, band, box)) {
      const cell = patchCellOf(params, patch)
      if (isRareOreCell(band, cell)) clusters.push(oreTilesOfPatch(params, patch, cell))
    }
  }
  return clusters.filter((tiles) => tiles.length > 0)
}

/** The guarantees grouped by their cell: each kind paints its own. */
function guaranteedClustersOf(params: PlanetParams): TilePoint[][] {
  const byCell = new Map<number, TilePoint[]>()
  for (const placed of guaranteedClusterTiles(params)) {
    byCell.set(placed.cell, [...(byCell.get(placed.cell) ?? []), placed])
  }
  return [...byCell.values()]
}

function generatedPlanetOf(params: PlanetParams): PlanetCells {
  const { min, max } = chunkRangeOfDisc(params.radiusTiles)
  const chunks = new Map<string, Uint32Array>()
  const digests: string[] = []
  for (let cy = min; cy <= max; cy++) {
    for (let cx = min; cx <= max; cx++) {
      const chunk = generateChunk(params, cx, cy)
      chunks.set(chunkKey(cx, cy), chunk.cells)
      digests.push(chunkDigest(chunk))
    }
  }
  return { params, chunks, digest: fnv1a64Hex(digests.join('')) }
}

function rareClustersOf(planet: PlanetCells): RareCluster[] {
  const seen = new Set<string>()
  const clusters: RareCluster[] = []
  for (const tile of rareTilesOf(planet)) {
    if (!seen.has(tileKeyOf(tile))) clusters.push(clusterFrom(planet, tile, seen))
  }
  return clusters
}

function rareTilesOf(planet: PlanetCells): TilePoint[] {
  const { min, max } = chunkRangeOfDisc(planet.params.radiusTiles)
  const tiles: TilePoint[] = []
  const first = firstTileOfChunk(min)
  const end = firstTileOfChunk(max + 1)
  for (let ty = first; ty < end; ty++) {
    for (let tx = first; tx < end; tx++) {
      if (isRareTile(planet, { tx, ty })) tiles.push({ tx, ty })
    }
  }
  return tiles
}

function isRareTile(planet: PlanetCells, tile: TilePoint): boolean {
  const band = bandOfTile(planet.params, tile.tx, tile.ty)
  return isRareOreCell(band, cellAt(planet, tile))
}

/** Flood over orthogonal neighbours holding the same cell in the same band. */
function clusterFrom(planet: PlanetCells, start: TilePoint, seen: Set<string>): RareCluster {
  const band = bandOfTile(planet.params, start.tx, start.ty)
  const cell = cellAt(planet, start)
  const tiles: TilePoint[] = []
  const open = [start]
  seen.add(tileKeyOf(start))
  while (open.length > 0) {
    const tile = open.pop() as TilePoint
    tiles.push(tile)
    for (const next of neighboursOf(tile)) {
      if (seen.has(tileKeyOf(next)) || !isSameClusterTile(planet, next, band, cell)) continue
      seen.add(tileKeyOf(next))
      open.push(next)
    }
  }
  return { band, cell, tiles }
}

function isSameClusterTile(planet: PlanetCells, tile: TilePoint, band: number, cell: number) {
  return cellAt(planet, tile) === cell && bandOfTile(planet.params, tile.tx, tile.ty) === band
}

function cellAt(planet: PlanetCells, tile: TilePoint): number {
  const chunk = planet.chunks.get(chunkKey(chunkOfTile(tile.tx), chunkOfTile(tile.ty)))
  return chunk === undefined ? 0 : chunk[cellIndexOfTile(tile.tx, tile.ty)]
}

function neighboursOf(tile: TilePoint): TilePoint[] {
  return [
    { tx: tile.tx + 1, ty: tile.ty },
    { tx: tile.tx - 1, ty: tile.ty },
    { tx: tile.tx, ty: tile.ty + 1 },
    { tx: tile.tx, ty: tile.ty - 1 },
  ]
}
