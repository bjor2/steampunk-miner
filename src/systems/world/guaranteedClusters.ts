/**
 * The guaranteed rare clusters (ticket 737, HS 2 and VS 1 on #737, GD lock 22 Oct): on a planet
 * under the rare-cluster rules, one cluster of each rare kind the slices name (`clusterKinds`, the
 * roster's rare, epic and mythic kinds), so every seed holds at least one of each. It obeys the gate
 * like any cluster: it sits only at `d >= 0.35`, in a band the kind is live in, and grows by the
 * same rule and size shares (`rareClusters.ts`). It is drawn on top of the patches, never in place of
 * one, so commons and uncommons keep their placement and the kind's cell count includes it.
 *
 * Placement, per kind in the hooks' order: a band from the kind's deep bands by the kind's own
 * seeded draw, then seeded tiles in the square round that band until one is plain ground of it
 * with no patch tile within 3 steps either way, no patch centre and no earlier guarantee seed within
 * 5, so the cluster neither takes nor touches any other ore. A kind with no deep band, or no such
 * tile in `MAX_DRAWS`, gets none.
 *
 * A function of the params alone, kept per params object, so any chunk order stamps the same cells.
 */
import { hashCell } from '../cellRandom'
import { clusterKindsOfHooks, foldOreCell, type ClusterKind } from '../registries/generationHooks'
import { createSeededRandom, type SeededRandom } from '../seededRandom'
import { SEED_PURPOSE, subSeedFor } from './generatorSeeds'
import { bandPatchesInBox, type OrePatch } from './orePatches'
import { isRareClusterPlanet, type PlanetParams } from './planetParams'
import { BAND_COUNT } from './planetGeometry'
import { DEEP_RARE_FIRST_BAND } from './planetTable'
import { grownClusterTiles, isDeepPlainGround, MAX_CLUSTER_CELLS, tileKeyOf } from './rareClusters'
import type { PlacedTile, TilePoint } from './tileGrid'
import { oreCell } from './worldCell'

/** Band 5 fills under a hundredth of its square at worst; a bound, not a tuning. */
const MAX_DRAWS = 4096
/** No patch tile this close either way, so no cluster cell lies next to another ore. */
const CLEAR_TILE_STEPS = MAX_CLUSTER_CELLS
/** No other seed this close either way, so no other cluster can reach a cell next to this one. */
const CLEAR_SEED_STEPS = 2 * MAX_CLUSTER_CELLS - 1
/** The guarantee stream of the rare-cluster sub-seed, apart from the size and order streams. */
const GUARANTEE_STREAM = 3

const guaranteesOfParams = new WeakMap<PlanetParams, readonly PlacedTile[]>()

/** Every guaranteed cluster cell of the planet, kinds in the hooks' order; none before rules 10. */
export function guaranteedClusterTiles(params: PlanetParams): readonly PlacedTile[] {
  if (!isRareClusterPlanet(params)) return []
  const known = guaranteesOfParams.get(params)
  if (known !== undefined) return known
  const tiles = placeGuaranteedClusters(params, clusterKindsOfHooks(params))
  guaranteesOfParams.set(params, tiles)
  return tiles
}

function placeGuaranteedClusters(
  params: PlanetParams,
  kinds: readonly ClusterKind[],
): PlacedTile[] {
  const seeds: TilePoint[] = []
  return kinds.flatMap((kind, at) => {
    const cluster = guaranteedClusterOf(params, kind, guaranteeRandomOf(params, at), seeds)
    if (cluster.length > 0) seeds.push(cluster[0])
    return cluster
  })
}

function guaranteedClusterOf(
  params: PlanetParams,
  kind: ClusterKind,
  random: SeededRandom,
  seeds: readonly TilePoint[],
): PlacedTile[] {
  const bands = deepBandsOf(kind)
  if (bands.length === 0) return []
  const band = bands[random.nextInt(bands.length)]
  const seed = drawClearSeed(params, band, random, seeds)
  if (seed === null) return []
  const cell = oreCell(kind.family, band - 1 + kind.lead, kind.kindSlot)
  const tiles = grownClusterTiles(params, seed, (tile) => isDeepPlainGround(params, band, tile))
  return tiles.map((tile) => ({ ...tile, cell: foldOreCell(params, tile, cell) }))
}

function deepBandsOf(kind: ClusterKind): number[] {
  return kind.bands.filter((band) => band >= DEEP_RARE_FIRST_BAND && band <= BAND_COUNT)
}

function drawClearSeed(
  params: PlanetParams,
  band: number,
  random: SeededRandom,
  seeds: readonly TilePoint[],
): TilePoint | null {
  const half = outerTilesOfBand(params, band)
  for (let draw = 0; draw < MAX_DRAWS; draw++) {
    const tile = {
      tx: random.nextInt(2 * half + 1) - half,
      ty: random.nextInt(2 * half + 1) - half,
    }
    if (isClearSeed(params, band, tile, seeds)) return tile
  }
  return null
}

/** Half the side of the square round the band's outer edge: band 1's is the radius. */
function outerTilesOfBand(params: PlanetParams, band: number): number {
  if (band === 1) return params.radiusTiles
  const outerHalfTileSq = params.bandStartsHalfTileSq[band - 2]
  return Math.ceil(Math.sqrt(outerHalfTileSq) / 2)
}

function isClearSeed(
  params: PlanetParams,
  band: number,
  tile: TilePoint,
  seeds: readonly TilePoint[],
): boolean {
  if (!isDeepPlainGround(params, band, tile)) return false
  if (seeds.some((seed) => chebyshevSteps(seed, tile) <= CLEAR_SEED_STEPS)) return false
  return !hasPatchNear(params, band, tile)
}

function hasPatchNear(params: PlanetParams, band: number, tile: TilePoint): boolean {
  const reach = CLEAR_SEED_STEPS
  const box = { x0: tile.tx - reach, y0: tile.ty - reach, x1: tile.tx + reach, y1: tile.ty + reach }
  return bandPatchesInBox(params, band, box).some((patch) => isPatchNear(patch, tile))
}

function isPatchNear(patch: OrePatch, tile: TilePoint): boolean {
  if (chebyshevSteps(patch.centre, tile) <= CLEAR_SEED_STEPS) return true
  return patch.tiles.some((own) => chebyshevSteps(own, tile) <= CLEAR_TILE_STEPS)
}

function chebyshevSteps(a: TilePoint, b: TilePoint): number {
  return Math.max(Math.abs(a.tx - b.tx), Math.abs(a.ty - b.ty))
}

function guaranteeRandomOf(params: PlanetParams, at: number): SeededRandom {
  const clusterSeed = subSeedFor(params, SEED_PURPOSE.rareCluster)
  return createSeededRandom(hashCell(hashCell(clusterSeed, GUARANTEE_STREAM, 0), at, 0))
}

/** Whether a tile holds a guaranteed cluster cell (reports tell guarantees from patch clusters). */
export function isGuaranteedClusterTile(params: PlanetParams, tile: TilePoint): boolean {
  const key = tileKeyOf(tile)
  return guaranteedClusterTiles(params).some((placed) => tileKeyOf(placed) === key)
}
