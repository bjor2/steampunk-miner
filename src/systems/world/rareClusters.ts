/**
 * Rare-ore clusters (Bjor's deep-rares rule, GD lock on ticket 737; Planet & Narrative's cluster
 * rule, Materials room, 22 Oct). On a planet under ore rules 10 an ore patch whose lead is rare or
 * above (`RARE_CLUSTER_FIRST_LEAD`) paints no patch. Its centre is the seed cell of a cluster of 1, 2
 * or 3 orthogonally connected cells, every one the patch's own cell, so rarity still counts one roll
 * per cluster while money counts the cells. Commons and uncommons keep their patches as they were.
 *
 * - The size is 1, 2 or 3 at 50/35/15 percent, from a hash of the planet's rare-cluster sub-seed and
 *   the seed cell.
 * - Growth takes, one cell at a time, the orthogonal neighbour of the cluster with the lowest hash
 *   that is cluster ground: plain ground of the seed's band (no cave, core or space) from band 3
 *   (`d >= 0.35`), on no tile another patch of the band covers, so a cluster never takes a common's
 *   tile. Where fewer cells qualify, the cluster stays smaller.
 * - A seed another patch covers grows nothing: that patch paints the tile.
 * - Two rare seeds of a band whose clusters could touch (5 or fewer steps apart) keep only the
 *   first's, by row then column, so two clusters never read as one.
 *
 * A function of the params and the patch alone, so any chunk order paints the same cluster.
 */
import { hashCell } from '../cellRandom'
import { baseCellOfTile } from './baseTerrain'
import { SEED_PURPOSE, subSeedFor } from './generatorSeeds'
import { bandPatchesInBox, type OrePatch } from './orePatches'
import { patchCellOf } from './patchCell'
import { isRareClusterPlanet, type PlanetParams } from './planetParams'
import { bandOfTile } from './planetGeometry'
import {
  DEEP_RARE_FIRST_BAND,
  RARE_CLUSTER_FIRST_LEAD,
  RARE_CLUSTER_SIZE_SHARES_PERCENT,
} from './planetTable'
import type { TilePoint } from './tileGrid'
import { CELL_KIND, GROUND_CELL, kindOfCell, tierOffsetOfCell } from './worldCell'

/** The largest cluster, so the farthest a cluster cell lies from its seed in steps. */
export const MAX_CLUSTER_CELLS = RARE_CLUSTER_SIZE_SHARES_PERCENT.length
const CLUSTER_REACH = MAX_CLUSTER_CELLS - 1
/** Two clusters whose seeds are this many steps apart or fewer could share an edge. */
const TOUCHING_SEED_STEPS = 2 * CLUSTER_REACH + 1
const PERCENT = 100
/** Hash streams of the rare-cluster sub-seed: a cluster's size, its growth order. */
const STREAM = { size: 1, order: 2 } as const

/** Whether a tile may hold a cluster cell beyond its seed. */
export type IsClusterGround = (tile: TilePoint) => boolean

/**
 * The tiles a patch paints: its cluster where it is a rare patch on a cluster planet, else every
 * tile it grew over.
 */
export function oreTilesOfPatch(
  params: PlanetParams,
  patch: OrePatch,
  cell: number,
): readonly TilePoint[] {
  return isRareClusterPatch(params, patch, cell) ? rareClusterTilesOf(params, patch) : patch.tiles
}

/** A rare, epic or mythic patch on a planet under the rare-cluster rules. */
export function isRareClusterPatch(params: PlanetParams, patch: OrePatch, cell: number): boolean {
  return isRareClusterPlanet(params) && isRareOreCell(patch.band, cell)
}

/** An ore cell whose tier is at least rare's lead over its band's own (ticket 445 offsets). */
export function isRareOreCell(band: number, cell: number): boolean {
  const lead = tierOffsetOfCell(cell) - (band - 1)
  return kindOfCell(cell) === CELL_KIND.ore && lead >= RARE_CLUSTER_FIRST_LEAD
}

/** Clusters depend on the patch alone; up to a dozen chunks ask for each. */
const clusterOfPatch = new WeakMap<OrePatch, readonly TilePoint[]>()

/** The cluster a rare patch paints, its seed (the patch centre) first; empty where it grows none. */
export function rareClusterTilesOf(params: PlanetParams, patch: OrePatch): readonly TilePoint[] {
  const known = clusterOfPatch.get(patch)
  if (known !== undefined) return known
  const tiles = clusterOfRarePatch(params, patch)
  clusterOfPatch.set(patch, tiles)
  return tiles
}

function clusterOfRarePatch(params: PlanetParams, patch: OrePatch): readonly TilePoint[] {
  const neighbours = otherPatchesNear(params, patch)
  if (!isSeedKept(params, patch, neighbours)) return []
  const covered = coveredTilesOf(neighbours)
  return grownClusterTiles(params, patch.centre, (tile) =>
    isClusterGround(params, patch.band, tile, covered),
  )
}

/**
 * The cluster grown from a seed: the seed, then up to `size - 1` cells, each the lowest-hash
 * orthogonal neighbour of the cells so far that the caller's ground test allows.
 */
export function grownClusterTiles(
  params: PlanetParams,
  seed: TilePoint,
  isGround: IsClusterGround,
): TilePoint[] {
  const tiles: TilePoint[] = [seed]
  const size = clusterSizeAt(params, seed)
  const orderSeed = streamSeedOf(params, STREAM.order, seed)
  while (tiles.length < size) {
    const next = nextClusterTile(tiles, isGround, seed, orderSeed)
    if (next === null) break
    tiles.push(next)
  }
  return tiles
}

/** 1, 2 or 3 cells at the shares of `RARE_CLUSTER_SIZE_SHARES_PERCENT`, from the seed's hash. */
export function clusterSizeAt(params: PlanetParams, seed: TilePoint): number {
  const roll = streamSeedOf(params, STREAM.size, seed) % PERCENT
  let below = 0
  for (let size = 1; size <= MAX_CLUSTER_CELLS; size++) {
    below += RARE_CLUSTER_SIZE_SHARES_PERCENT[size - 1]
    if (roll < below) return size
  }
  return MAX_CLUSTER_CELLS
}

/** Plain ground of the band, at `d >= 0.35`: where a rare cluster may grow or a guarantee sit. */
export function isDeepPlainGround(params: PlanetParams, band: number, tile: TilePoint): boolean {
  return (
    band >= DEEP_RARE_FIRST_BAND &&
    bandOfTile(params, tile.tx, tile.ty) === band &&
    baseCellOfTile(params, tile.tx, tile.ty) === GROUND_CELL
  )
}

export function tileKeyOf(tile: TilePoint): string {
  return `${tile.tx},${tile.ty}`
}

function isClusterGround(
  params: PlanetParams,
  band: number,
  tile: TilePoint,
  covered: ReadonlySet<string>,
): boolean {
  return !covered.has(tileKeyOf(tile)) && isDeepPlainGround(params, band, tile)
}

function nextClusterTile(
  tiles: readonly TilePoint[],
  isGround: IsClusterGround,
  seed: TilePoint,
  orderSeed: number,
): TilePoint | null {
  let best: TilePoint | null = null
  let bestOrder = 0
  for (const tile of tiles.flatMap(neighboursOf)) {
    if (tiles.some((taken) => isSameTile(taken, tile)) || !isGround(tile)) continue
    const order = hashCell(orderSeed, tile.tx - seed.tx, tile.ty - seed.ty)
    if (best === null || order < bestOrder) [best, bestOrder] = [tile, order]
  }
  return best
}

/** The band's other patches whose tiles or clusters can reach the seed's touching distance. */
function otherPatchesNear(params: PlanetParams, patch: OrePatch): OrePatch[] {
  const { tx, ty } = patch.centre
  const reach = TOUCHING_SEED_STEPS
  const box = { x0: tx - reach, y0: ty - reach, x1: tx + reach, y1: ty + reach }
  return bandPatchesInBox(params, patch.band, box).filter(
    (other) => !isSameTile(other.centre, patch.centre),
  )
}

/** The seed is free of other patches and the first of the rare seeds its cluster could touch. */
function isSeedKept(params: PlanetParams, patch: OrePatch, neighbours: readonly OrePatch[]) {
  const isCovered = neighbours.some((other) => isTileOfPatch(other, patch.centre))
  return !isCovered && !neighbours.some((other) => isEarlierTouchingRare(params, patch, other))
}

function isEarlierTouchingRare(params: PlanetParams, patch: OrePatch, other: OrePatch): boolean {
  const isTouching = stepsBetween(patch.centre, other.centre) <= TOUCHING_SEED_STEPS
  return (
    isTouching &&
    isBeforeInRows(other.centre, patch.centre) &&
    isRareOreCell(other.band, patchCellOf(params, other))
  )
}

function coveredTilesOf(patches: readonly OrePatch[]): Set<string> {
  return new Set(patches.flatMap((patch) => patch.tiles.map(tileKeyOf)))
}

function isTileOfPatch(patch: OrePatch, tile: TilePoint): boolean {
  return patch.tiles.some((own) => isSameTile(own, tile))
}

function isBeforeInRows(a: TilePoint, b: TilePoint): boolean {
  return a.ty < b.ty || (a.ty === b.ty && a.tx < b.tx)
}

function stepsBetween(a: TilePoint, b: TilePoint): number {
  return Math.abs(a.tx - b.tx) + Math.abs(a.ty - b.ty)
}

function isSameTile(a: TilePoint, b: TilePoint): boolean {
  return a.tx === b.tx && a.ty === b.ty
}

function neighboursOf(tile: TilePoint): TilePoint[] {
  return [
    { tx: tile.tx + 1, ty: tile.ty },
    { tx: tile.tx - 1, ty: tile.ty },
    { tx: tile.tx, ty: tile.ty + 1 },
    { tx: tile.tx, ty: tile.ty - 1 },
  ]
}

function streamSeedOf(params: PlanetParams, stream: number, seed: TilePoint): number {
  const clusterSeed = subSeedFor(params, SEED_PURPOSE.rareCluster)
  return hashCell(hashCell(clusterSeed, stream, 0), seed.tx, seed.ty)
}
