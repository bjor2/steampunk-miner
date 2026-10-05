/**
 * The artefact cache (decision #46, amended by the Game Director and Technical Director): one
 * `artefact_cache` cell per planet on the material layer, in band 3 on planet 1 and band 2 on
 * planet 2, placed from the sub-seed `artefactCache`. The generator is a pure function of the
 * params: no player state ever reaches it, so planet 2 always places its cache and the chunk
 * digests never depend on what a player chose. Whether a cache is live or a husk is read from the
 * authority at interact time, never written into the ground.
 *
 * Placement: seeded tiles in the planet's bounding square until one lies in the cache band with
 * plain ground on it and all round it, so the cache sits in solid rock, not on a cave wall.
 */
import { createSeededRandom, type SeededRandom } from '../seededRandom'
import { baseCellOfTile } from './baseTerrain'
import { SEED_PURPOSE, subSeedFor } from './generatorSeeds'
import type { PlanetParams } from './planetParams'
import { bandOfTile, isInsidePlanet } from './planetGeometry'
import type { PlacedTile, TilePoint } from './tileGrid'
import { ARTEFACT_CACHE_CELL, GROUND_CELL } from './worldCell'

/** Far more than band 2 or 3 ever needs (they cover over a quarter of the square); a bound, not a tuning. */
const MAX_DRAWS = 4096
const NEIGHBOURS: readonly TilePoint[] = [-1, 0, 1].flatMap((dy) =>
  [-1, 0, 1].map((dx) => ({ tx: dx, ty: dy })),
)

/** Every chunk asks; the answer depends on the params alone, so it is kept per params object. */
const cacheOfParams = new WeakMap<PlanetParams, TilePoint>()

/** The planet's one cache tile. */
export function artefactCacheTile(params: PlanetParams): TilePoint {
  const known = cacheOfParams.get(params)
  if (known !== undefined) return known
  const tile = drawCacheTile(
    params,
    createSeededRandom(subSeedFor(params, SEED_PURPOSE.artefactCache)),
  )
  cacheOfParams.set(params, tile)
  return tile
}

/** The cache as a placed tile, stamped over terrain and ore like the dock and the starter vein. */
export function artefactCacheTiles(params: PlanetParams): PlacedTile[] {
  return [{ ...artefactCacheTile(params), cell: ARTEFACT_CACHE_CELL }]
}

export function isArtefactCacheTile(params: PlanetParams, tile: TilePoint): boolean {
  const cache = artefactCacheTile(params)
  return cache.tx === tile.tx && cache.ty === tile.ty
}

function drawCacheTile(params: PlanetParams, random: SeededRandom): TilePoint {
  const side = 2 * params.radiusTiles + 1
  for (let draw = 0; draw < MAX_DRAWS; draw++) {
    const tile = {
      tx: random.nextInt(side) - params.radiusTiles,
      ty: random.nextInt(side) - params.radiusTiles,
    }
    if (isCacheSite(params, tile)) return tile
  }
  throw new Error(`no artefact cache site on planet ${params.planetIndex} in ${MAX_DRAWS} draws`)
}

function isCacheSite(params: PlanetParams, tile: TilePoint): boolean {
  return (
    isInsidePlanet(params, tile.tx, tile.ty) &&
    bandOfTile(params, tile.tx, tile.ty) === params.artefactCacheBand &&
    isEmbeddedInGround(params, tile)
  )
}

function isEmbeddedInGround(params: PlanetParams, tile: TilePoint): boolean {
  return NEIGHBOURS.every(
    (step) => baseCellOfTile(params, tile.tx + step.tx, tile.ty + step.ty) === GROUND_CELL,
  )
}
