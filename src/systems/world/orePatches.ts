/**
 * Ore patches (decision #42): contiguous disc stamps on the 1 m material layer, larger and rarer
 * than the first slice's per-tile sprinkle at the same expected ore fraction per band.
 *
 * - Per band `b`, a lattice of spacing `G = max(6, floor(sqrt(mean / density)))` metres. At node
 *   `(i, j)` a hash decides whether a patch fires (`< patchSeedChanceBp[b]`), a second hash jitters
 *   the centre by at most `G/3`, and the patch belongs to band `b` only if its centre lies in it.
 *   #42 writes `round` for `G`; `floor` keeps the solved chance under 1 in every band (with `round`,
 *   bands 1 to 4 would need a chance above 1 to reach their density).
 * - A patch grows from its centre over plain ground of its own band, always taking the nearest
 *   tile next to what it already holds (ties in the patch's own hash order), until it holds
 *   `mean` tiles. Unblocked it is the disc `r = max(2, round(sqrt(mean / pi)))`; where caves, a
 *   band edge, the core or the surface clip the disc it grows round them, so it stays one
 *   contiguous patch of `mean` tiles (#42 acceptance 2) unless the ground within `r + 3` of its
 *   centre is smaller.
 *   A centre that is not plain ground of its band fires no patch.
 * - The family comes from the patch's hash and the planet's family weights; the tier offset is
 *   `b - 1` (#6 `t = 3(p-1) + b`).
 *
 * Patches are a pure function of the params and the node, and are painted in one fixed order
 * (band, then row, then column), so every chunk sees the same overlaps whatever order it is made in.
 */
import { hashCell } from '../cellRandom'
import { baseCellOfTile } from './baseTerrain'
import { SEED_PURPOSE, subSeedFor } from './generatorSeeds'
import type { PlanetParams } from './planetParams'
import { BAND_COUNT, bandOfTile } from './planetGeometry'
import { CHUNK_SIZE, firstTileOfChunk, type TilePoint } from './tileGrid'
import { GROUND_CELL, RESOURCE_FAMILY, type ResourceFamily } from './worldCell'

export interface OrePatch {
  band: number
  centre: TilePoint
  family: ResourceFamily
  /** The plain-ground tiles of its band the patch grew over. */
  tiles: readonly TilePoint[]
}

interface BandLattice {
  band: number
  spacing: number
  jitter: number
  /** Patch tiles reach at most this far from a lattice node. */
  reach: number
  mean: number
  chanceBp: number
  seed: number
}

const MIN_LATTICE_SPACING = 6
const MIN_PATCH_RADIUS = 2
const GROWTH_MARGIN_TILES = 3
const BASIS_POINTS = 10000
/** Hash streams of one band's lattice: fire, jitter x, jitter y, family, tie-break. */
const STREAM = { fire: 1, jitterX: 2, jitterY: 3, family: 4, order: 5 } as const

/** Every patch of every band that can paint a tile of chunk `(cx, cy)`, in painting order. */
export function orePatchesNearChunk(params: PlanetParams, cx: number, cy: number): OrePatch[] {
  const x0 = firstTileOfChunk(cx)
  const y0 = firstTileOfChunk(cy)
  return bandLatticesOf(params).flatMap((lattice) =>
    patchesInBox(params, lattice, x0, y0, x0 + CHUNK_SIZE - 1, y0 + CHUNK_SIZE - 1),
  )
}

/** Every band-`band` patch whose tiles can touch the box `[x0, x1] x [y0, y1]`. */
export function bandPatchesInBox(
  params: PlanetParams,
  band: number,
  box: { x0: number; y0: number; x1: number; y1: number },
): OrePatch[] {
  return patchesInBox(params, bandLatticesOf(params)[band - 1], box.x0, box.y0, box.x1, box.y1)
}

/** One extra patch of a band's mean size at a fixed centre (the dock guarantee, #42). */
export function patchAt(params: PlanetParams, band: number, centre: TilePoint): OrePatch {
  const lattice = bandLatticesOf(params)[band - 1]
  return patchOf(params, lattice, centre, centre.tx, centre.ty)
}

/** The lattice spacing of a band, `max(6, floor(sqrt(mean / density)))`. */
export function latticeSpacingOf(meanCells: number, densityBp: number): number {
  return Math.max(
    MIN_LATTICE_SPACING,
    Math.floor(Math.sqrt((meanCells * BASIS_POINTS) / densityBp)),
  )
}

/** #42: `r = max(2, round(sqrt(mean / pi)))`. */
export function patchRadiusOf(meanCells: number): number {
  return Math.max(MIN_PATCH_RADIUS, Math.round(Math.sqrt(meanCells / Math.PI)))
}

/** A clipped patch grows round the obstacle, but never past this distance from its centre. */
function growthRadiusOf(meanCells: number): number {
  return patchRadiusOf(meanCells) + GROWTH_MARGIN_TILES
}

function bandLatticesOf(params: PlanetParams): BandLattice[] {
  const patchSeed = subSeedFor(params, SEED_PURPOSE.orePatch)
  const lattices: BandLattice[] = []
  for (let band = 1; band <= BAND_COUNT; band++) {
    const mean = params.patchMeanCells[band - 1]
    const spacing = latticeSpacingOf(mean, params.oreDensityBp[band - 1])
    const jitter = Math.floor(spacing / 3)
    lattices.push({
      band,
      spacing,
      jitter,
      reach: jitter + growthRadiusOf(mean),
      mean,
      chanceBp: params.patchSeedChanceBp[band - 1],
      seed: hashCell(patchSeed, band, 0),
    })
  }
  return lattices
}

function patchesInBox(
  params: PlanetParams,
  lattice: BandLattice,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): OrePatch[] {
  const { spacing, reach } = lattice
  const patches: OrePatch[] = []
  for (let j = Math.floor((y0 - reach) / spacing); j * spacing <= y1 + reach; j++) {
    for (let i = Math.floor((x0 - reach) / spacing); i * spacing <= x1 + reach; i++) {
      const patch = firedPatchAt(params, lattice, i, j)
      if (patch !== null) patches.push(patch)
    }
  }
  return patches
}

/**
 * A patch is a function of the params and its node alone, and up to a dozen chunks ask for each
 * one, so the answers are kept per params object; dropping them only costs time.
 */
const patchesOfParams = new WeakMap<PlanetParams, Map<string, OrePatch | null>>()
const MAX_KEPT_PATCHES = 200_000

function firedPatchAt(
  params: PlanetParams,
  lattice: BandLattice,
  i: number,
  j: number,
): OrePatch | null {
  const kept = keptPatchesOf(params)
  const key = `${lattice.band}:${i}:${j}`
  const known = kept.get(key)
  if (known !== undefined) return known
  const patch = patchOfNode(params, lattice, i, j)
  if (kept.size >= MAX_KEPT_PATCHES) kept.clear()
  kept.set(key, patch)
  return patch
}

function keptPatchesOf(params: PlanetParams): Map<string, OrePatch | null> {
  const kept = patchesOfParams.get(params) ?? new Map<string, OrePatch | null>()
  patchesOfParams.set(params, kept)
  return kept
}

function patchOfNode(
  params: PlanetParams,
  lattice: BandLattice,
  i: number,
  j: number,
): OrePatch | null {
  if (streamHash(lattice, STREAM.fire, i, j) % BASIS_POINTS >= lattice.chanceBp) return null
  const centre = {
    tx: i * lattice.spacing + jitterOf(lattice, STREAM.jitterX, i, j),
    ty: j * lattice.spacing + jitterOf(lattice, STREAM.jitterY, i, j),
  }
  if (!isPatchGround(params, lattice.band, centre)) return null
  return patchOf(params, lattice, centre, i, j)
}

function patchOf(
  params: PlanetParams,
  lattice: BandLattice,
  centre: TilePoint,
  i: number,
  j: number,
): OrePatch {
  return {
    band: lattice.band,
    centre,
    family: familyOf(params, streamHash(lattice, STREAM.family, i, j)),
    tiles: grownTiles(params, lattice, centre, streamHash(lattice, STREAM.order, i, j)),
  }
}

interface Candidate extends TilePoint {
  distanceSq: number
  order: number
}

/** Nearest-first growth over plain ground of the band, 4-connected, up to `mean` tiles. */
function grownTiles(
  params: PlanetParams,
  lattice: BandLattice,
  centre: TilePoint,
  orderSeed: number,
): TilePoint[] {
  const radius = growthRadiusOf(lattice.mean)
  const tiles: TilePoint[] = []
  const seen = new Set<string>([tileKeyOf(centre)])
  const frontier: Candidate[] = [candidateOf(centre, centre, orderSeed)]
  while (tiles.length < lattice.mean && frontier.length > 0) {
    const next = takeNearest(frontier)
    if (!isPatchGround(params, lattice.band, next)) continue
    tiles.push({ tx: next.tx, ty: next.ty })
    for (const neighbour of neighboursOf(next)) {
      if (seen.has(tileKeyOf(neighbour))) continue
      seen.add(tileKeyOf(neighbour))
      const candidate = candidateOf(neighbour, centre, orderSeed)
      if (candidate.distanceSq <= radius * radius) frontier.push(candidate)
    }
  }
  return tiles
}

function candidateOf(tile: TilePoint, centre: TilePoint, orderSeed: number): Candidate {
  const dx = tile.tx - centre.tx
  const dy = tile.ty - centre.ty
  return { ...tile, distanceSq: dx * dx + dy * dy, order: hashCell(orderSeed, dx, dy) }
}

/** Removes and returns the candidate nearest the centre, ties by the patch's hash order. */
function takeNearest(frontier: Candidate[]): Candidate {
  let best = 0
  for (let at = 1; at < frontier.length; at++) {
    if (isBefore(frontier[at], frontier[best])) best = at
  }
  const [nearest] = frontier.splice(best, 1)
  return nearest
}

function isBefore(a: Candidate, b: Candidate): boolean {
  return a.distanceSq < b.distanceSq || (a.distanceSq === b.distanceSq && a.order < b.order)
}

function neighboursOf(tile: TilePoint): TilePoint[] {
  return [
    { tx: tile.tx + 1, ty: tile.ty },
    { tx: tile.tx - 1, ty: tile.ty },
    { tx: tile.tx, ty: tile.ty + 1 },
    { tx: tile.tx, ty: tile.ty - 1 },
  ]
}

function tileKeyOf(tile: TilePoint): string {
  return `${tile.tx},${tile.ty}`
}

/** Plain ground of the band in the seeded terrain: not space, core, a cave or another band. */
function isPatchGround(params: PlanetParams, band: number, tile: TilePoint): boolean {
  return (
    baseCellOfTile(params, tile.tx, tile.ty) === GROUND_CELL &&
    bandOfTile(params, tile.tx, tile.ty) === band
  )
}

function jitterOf(lattice: BandLattice, stream: number, i: number, j: number): number {
  return (streamHash(lattice, stream, i, j) % (2 * lattice.jitter + 1)) - lattice.jitter
}

function familyOf(params: PlanetParams, hash: number): ResourceFamily {
  const { metal, crystal } = params.familyWeights
  return hash % (metal + crystal) < metal ? RESOURCE_FAMILY.metal : RESOURCE_FAMILY.crystal
}

function streamHash(lattice: BandLattice, stream: number, i: number, j: number): number {
  return hashCell(hashCell(lattice.seed, stream, 0), i, j)
}
