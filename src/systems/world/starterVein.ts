/**
 * The guaranteed early ore (decision #16): on planet 1, a seeded vein of the lowest ore tier
 * beside the dock pad, every tile of it within 15 tiles of the dock, in a zone where no enemy may
 * spawn. The vein is a small blob around a seeded centre 7 to 10 columns from the middle of the
 * pad and 2 to 6 rows below it, so it never touches the pad or its clearance and its farthest
 * tile is under 14 tiles from the dock point.
 */
import { createSeededRandom, type SeededRandom } from '../seededRandom'
import { dockSiteOf, type DockSite } from './dockSite'
import { SEED_PURPOSE, subSeedFor } from './generatorSeeds'
import type { PlanetParams } from './planetParams'
import { STARTER_ZONE_RADIUS_TILES } from './planetTable'
import { halfTileRadiusSq, type PlacedTile, type TilePoint } from './tileGrid'
import { oreCell, RESOURCE_FAMILY, type ResourceFamily } from './worldCell'

const MIN_COLUMN_OFFSET = 7
const COLUMN_OFFSET_CHOICES = 4
const MIN_ROWS_BELOW_PAD = 2
const ROWS_BELOW_PAD_CHOICES = 5
/** Chance that each of the eight neighbours of the centre is ore too. */
const NEIGHBOUR_ORE_CHANCE = 0.6
const LOWEST_TIER_OFFSET = 0

export function starterVeinTiles(params: PlanetParams): PlacedTile[] {
  if (!params.hasStarterVein) return []
  const random = createSeededRandom(subSeedFor(params, SEED_PURPOSE.starterVein))
  const centre = pickVeinCentre(random, dockSiteOf(params))
  const cell = oreCell(pickVeinFamily(random, params), LOWEST_TIER_OFFSET)
  return veinBlobAround(random, centre).map((tile) => ({ ...tile, cell }))
}

/** The enemy-free zone around the dock on a planet with a starter vein (#16). */
export function isInStarterZone(params: PlanetParams, tx: number, ty: number): boolean {
  if (!params.hasStarterVein) return false
  return (
    halfTileDistanceSqToDock(dockSiteOf(params), tx, ty) <=
    halfTileRadiusSq(STARTER_ZONE_RADIUS_TILES)
  )
}

/** From the dock point (the middle of the pad's top edge) to a tile's centre, in half tiles. */
export function halfTileDistanceSqToDock(site: DockSite, tx: number, ty: number): number {
  const dx = 2 * tx + 1 - 2 * site.dockPoint.tx
  const dy = 2 * ty + 1 - 2 * site.dockPoint.ty
  return dx * dx + dy * dy
}

function pickVeinCentre(random: SeededRandom, site: DockSite): TilePoint {
  const columnOffset = MIN_COLUMN_OFFSET + random.nextInt(COLUMN_OFFSET_CHOICES)
  const isRightOfPad = random.nextInt(2) === 1
  return {
    tx: isRightOfPad ? columnOffset : -columnOffset - 1,
    ty: site.padRow - MIN_ROWS_BELOW_PAD - random.nextInt(ROWS_BELOW_PAD_CHOICES),
  }
}

function pickVeinFamily(random: SeededRandom, params: PlanetParams): ResourceFamily {
  const { metal, crystal } = params.familyWeights
  return random.nextInt(metal + crystal) < metal ? RESOURCE_FAMILY.metal : RESOURCE_FAMILY.crystal
}

function veinBlobAround(random: SeededRandom, centre: TilePoint): TilePoint[] {
  const tiles: TilePoint[] = [centre]
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const isNeighbour = dx !== 0 || dy !== 0
      if (isNeighbour && random.nextFloat() < NEIGHBOUR_ORE_CHANCE) {
        tiles.push({ tx: centre.tx + dx, ty: centre.ty + dy })
      }
    }
  }
  return tiles
}
