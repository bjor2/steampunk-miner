/**
 * A planet's pinned surface layer (ticket 625, the rules and their sources in
 * `economy/surfaceLayerRules.ts`): the hardness of the rock in each cell of depth from the surface
 * down to band 1's own value, on a planet stamped with ore rules 5 or later. Below the layer, and
 * on any planet stamped earlier (a save keeps its stamp, HS condition 3), rock keeps the shipped
 * band value; ore and core cells keep their own hardness everywhere.
 *
 * Depth is radial: a tile is `d` cells deep when its centre lies inside the disc of radius `R - d`
 * and not inside `R - d - 1`, compared on squared half-tile radii so it needs no square root (#4).
 * The ramp's step is `eta^(rise / K)`, `rise` the tiers from the surface to band 1, taken as the
 * fixed-iteration `nthRoot` of `eta` raised to whole powers, so every OS computes the same digits.
 */
import { ECONOMY } from '../economy/economy'
import { compoundRatio } from '../economy/curveFamilies'
import { oreTier } from '../economy/oreEconomy'
import { surfaceTiersOf, type SurfaceLayerRules } from '../economy/surfaceLayerRules'
import { cmp, mul, nthRoot, powInt, type BigStat } from '../money'
import { isSurfaceLayerPlanet, type PlanetParams } from './planetParams'
import { halfTileDistanceSq, halfTileRadiusSq, type TilePoint } from './tileGrid'

export interface SurfaceLayer {
  pinnedCells: number
  /** K(p): the cells from the pinned layer to band 1's value, the last of them at it. */
  rampCells: number
  /** K(p) before the band-1 cap; above `rampCells` where the cap binds. */
  uncappedRampCells: number
  /** The hardness ratio between neighbouring ramp cells: at most `rampStepRatio` uncapped. */
  rampStepRatio: BigStat
  /** The rock hardness of each depth above band 1's own value, from the surface cell down. */
  hardnessByDepth: readonly BigStat[]
}

const BAND_ONE = 1
const MAX_CACHED_PLANETS = 64
const layerCache = new Map<string, SurfaceLayer | null>()

/**
 * The planet's surface layer, or null where its rock is the shipped band value at every depth: a
 * planet stamped before the layer, or one whose band 1 is no harder than its surface (planet 1).
 */
export function surfaceLayerOf(params: PlanetParams): SurfaceLayer | null {
  if (!isSurfaceLayerPlanet(params)) return null
  return cachedLayerOf(params, () => buildSurfaceLayer(params, ECONOMY.planets.surfaceLayer))
}

/** The pinned or ramp hardness of a rock tile, or null below the layer (band 1's own value). */
export function surfaceRockHardnessAt(params: PlanetParams, tile: TilePoint): BigStat | null {
  const layer = surfaceLayerOf(params)
  if (layer === null) return null
  return layer.hardnessByDepth[layerDepthOf(params, tile, layer.hardnessByDepth.length)] ?? null
}

/** Whether the band-1 cap shortened the planet's ramp, so its step is above `rampStepRatio`. */
export function isRampCapped(layer: SurfaceLayer): boolean {
  return layer.rampCells < layer.uncappedRampCells
}

/** The layer of `params` under `rules`: what `surfaceLayerOf` caches for this build's rules. */
export function buildSurfaceLayer(
  params: PlanetParams,
  rules: SurfaceLayerRules,
): SurfaceLayer | null {
  const surfaceTiers = surfaceTiersOf(rules, params.planetIndex)
  const riseTiers = oreTier(params.planetIndex, BAND_ONE) - 1 - surfaceTiers
  if (riseTiers <= 0) return null
  return rampedLayerOf(rules, { surfaceTiers, riseTiers, capCells: capCellsOf(params, rules) })
}

interface LayerShape {
  surfaceTiers: number
  /** The hardness tiers from the surface up to band 1's rock. */
  riseTiers: number
  /** The most ramp cells band 1 holds below the pinned cells. */
  capCells: number
}

function rampedLayerOf(rules: SurfaceLayerRules, shape: LayerShape): SurfaceLayer {
  const uncappedRampCells = rampCellsFor(rules, shape)
  const rampCells = Math.max(1, Math.min(uncappedRampCells, shape.capCells))
  const stepRoot = nthRoot(ECONOMY.ore.hardnessRatio, rampCells)
  return {
    pinnedCells: rules.pinnedCells,
    rampCells,
    uncappedRampCells,
    rampStepRatio: powInt(stepRoot, shape.riseTiers),
    hardnessByDepth: hardnessByDepthOf(rules.pinnedCells, rampCells, shape, stepRoot),
  }
}

function capCellsOf(params: PlanetParams, rules: SurfaceLayerRules): number {
  return bandOneDepthCells(params) - rules.pinnedCells
}

/**
 * K(p) = max(rampMinCells, ceil(log_ratio(eta^rise))): the fewest cells, from `rampMinCells`, whose
 * steps of `rampStepRatio` reach band 1, compared exactly. `eta` is below the step ratio, so `rise`
 * cells always do; a binary search between the two keeps any planet to a few dozen powers.
 */
function rampCellsFor(rules: SurfaceLayerRules, shape: LayerShape): number {
  const rise = compoundRatio(ECONOMY.ore.hardnessRatio, shape.riseTiers)
  const reaches = (cells: number) => cmp(powInt(rules.rampStepRatio, cells), rise) >= 0
  let fewest = rules.rampMinCells
  let most = Math.max(fewest, shape.riseTiers)
  while (fewest < most) {
    const middle = Math.floor((fewest + most) / 2)
    if (reaches(middle)) most = middle
    else fewest = middle + 1
  }
  return fewest
}

/**
 * `H_s` on the pinned cells, then `H_s * step^j` on ramp cells 1 to K - 1, `step^j` taken as
 * `stepRoot^(rise * j)`; ramp cell K is band 1's own rock.
 */
function hardnessByDepthOf(
  pinnedCells: number,
  rampCells: number,
  shape: LayerShape,
  stepRoot: BigStat,
): BigStat[] {
  const surface = compoundRatio(ECONOMY.ore.hardnessRatio, shape.surfaceTiers)
  const pinned = Array.from({ length: pinnedCells }, () => surface)
  const ramp = Array.from({ length: rampCells - 1 }, (_, at) =>
    mul(surface, powInt(stepRoot, shape.riseTiers * (at + 1))),
  )
  return [...pinned, ...ramp]
}

/**
 * The whole cells of depth that lie in band 1 at every tile: depth `d` does while the disc of
 * radius `R - d - 1` still reaches past band 2's start.
 */
function bandOneDepthCells(params: PlanetParams): number {
  const bandTwoStart = params.bandStartsHalfTileSq[0]
  let cells = 0
  while (halfTileRadiusSq(params.radiusTiles - cells - 1) >= bandTwoStart) cells++
  return cells
}

/** The tile's depth in cells below the surface, `cells` where it lies at or below the layer. */
function layerDepthOf(params: PlanetParams, tile: TilePoint, cells: number): number {
  const distanceSq = halfTileDistanceSq(tile.tx, tile.ty)
  let depth = 0
  while (depth < cells && distanceSq <= halfTileRadiusSq(params.radiusTiles - depth - 1)) depth++
  return depth
}

function cacheKeyOf(params: PlanetParams): string {
  const bandTwoStart = params.bandStartsHalfTileSq[0]
  return `${params.planetIndex}:${params.oreRulesVersion}:${params.radiusTiles}:${bandTwoStart}`
}

function cachedLayerOf(
  params: PlanetParams,
  build: () => SurfaceLayer | null,
): SurfaceLayer | null {
  const key = cacheKeyOf(params)
  const cached = layerCache.get(key)
  if (cached !== undefined) return cached
  const layer = build()
  if (layerCache.size >= MAX_CACHED_PLANETS) layerCache.clear()
  layerCache.set(key, layer)
  return layer
}
