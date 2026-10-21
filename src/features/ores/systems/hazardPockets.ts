/**
 * Each planet's hazard pockets in the ground (ticket 652, the design rows of ticket 651, spec
 * #647), the kernel's one `hazardPockets` provider. The planet registry row's `hazard` places them
 * (`planetHazards.ts`):
 *
 * - The window is the row's `fromDepth` to `toDepth`, `floor(num * R / den)` whole cells from the
 *   surface at the planet's radius, so a bigger planet keeps its hazard at the same place of its
 *   descent. Depth is radial, as the surface layer counts it: a tile is `d` cells deep when its
 *   centre lies inside the disc of radius `R - d` and not inside `R - d - 1`, compared on squared
 *   half-tile radii (#4).
 * - The lattice is lava's (#113): the ground is cut into `pocketTiles` square blocks, and a block
 *   is a pocket under `pocketChanceBp` from the block's own hash on this provider's seed, so the
 *   planet is the same in any chunk order. A block across a window edge is clipped to the window.
 * - Only plain ground is a pocket: ore, the core, caves and the placed features (the pad, its
 *   clearance, the starter vein, the cache) keep what they are.
 *
 * The read never repaints a cell, so a planet's generated cells stay byte-identical; the kernel asks
 * it only on a planet entered under ore rules 8 (`hazardPockets.ts`).
 */
import { hashCell } from '../../../systems/cellRandom'
import { subSeedForHook } from '../../../systems/registries/hookSeed'
import type {
  HazardPocketsProvider,
  HazardPocketTest,
} from '../../../systems/registries/hazardPockets'
import type { PlanetParams } from '../../../systems/world/planetParams'
import {
  halfTileDistanceSq,
  halfTileRadiusSq,
  type TilePoint,
} from '../../../systems/world/tileGrid'
import { GROUND_CELL } from '../../../systems/world/worldCell'
import { ORE_ROWS } from './oreRows'
import { hazardDepthWindowCellsOf, hazardOfPlanet, type PlanetHazard } from './planetHazards'

/** The seed's id: renaming it moves every pocket, a generator change (feature-slices.md 5.2). */
export const HAZARD_POCKETS_PROVIDER_ID = 'ores.hazard-pockets'

const BASIS_POINTS = 10000

export const HAZARD_POCKETS_PROVIDER: HazardPocketsProvider = {
  id: HAZARD_POCKETS_PROVIDER_ID,
  pocketTestOf: (params) => {
    const hazard = hazardOfPlanet(ORE_ROWS.planets, params.planetIndex)
    return hazard === null ? null : pocketTestFor(params, hazard)
  },
}

/** The read of `hazard`'s pockets on the planet of `params`, its window and seed worked out once. */
function pocketTestFor(params: PlanetParams, hazard: PlanetHazard): HazardPocketTest {
  const window = windowHalfTileSqOf(params, hazard)
  const seed = subSeedForHook(params, HAZARD_POCKETS_PROVIDER_ID)
  return (tile, cell) =>
    cell === GROUND_CELL && isInWindow(window, tile) && isPocketBlock(seed, hazard, tile)
      ? hazard.kind
      : null
}

/** The window as squared half-tile radii: a tile's centre at most `outer` and above `inner`. */
interface WindowHalfTileSq {
  outer: number
  inner: number
}

function windowHalfTileSqOf(params: PlanetParams, hazard: PlanetHazard): WindowHalfTileSq {
  const { fromCells, toCells } = hazardDepthWindowCellsOf(hazard, params.radiusTiles)
  return {
    outer: halfTileRadiusSq(params.radiusTiles - fromCells),
    inner: halfTileRadiusSq(params.radiusTiles - toCells),
  }
}

/** At least `fromCells` deep and less than `toCells` deep. */
function isInWindow(window: WindowHalfTileSq, tile: TilePoint): boolean {
  const distanceSq = halfTileDistanceSq(tile.tx, tile.ty)
  return distanceSq <= window.outer && distanceSq > window.inner
}

function isPocketBlock(seed: number, hazard: PlanetHazard, tile: TilePoint): boolean {
  const bx = Math.floor(tile.tx / hazard.pocketTiles)
  const by = Math.floor(tile.ty / hazard.pocketTiles)
  return hashCell(seed, bx, by) % BASIS_POINTS < hazard.pocketChanceBp
}
