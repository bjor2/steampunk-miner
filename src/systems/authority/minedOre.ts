/**
 * Which ore a mined cell held, as `CargoAdded` reports it (#122, step 2 of the logging rollout in
 * #104): its tier, its ore id, how deep the cell lay and the chunk it lay in, so the run log can
 * list the minerals in the order they were mined and line them up against perf samples.
 *
 * `oreId` is the one field #155 names for this, shared with the ore catalogue (#146): the
 * `oreTypeOf({tier, cellFamily}).id` of docs/standards/feature-slices.md 3.5, which is the kernel
 * default `kernel.<family>.t<tier>` until the `ores` slice provides a catalogue.
 *
 * `saleTier` is the tier the unit is kept and sold at (#232): a signature's is one up. It stays off
 * `CargoAdded`, whose `resourceTier` is the cell's own.
 */
import { oreTier } from '../economy/oreEconomy'
import { depthTilesAt } from '../world/planetGeometry'
import type { PlanetParams } from '../world/planetParams'
import { oreCargoTagsOf, oreTypeOf, saleTierOf, type OreCargoTags } from '../registries/oreTypes'
import { chunkKey, chunkOfTile, type TilePoint } from '../world/tileGrid'
import { familyOfCell, MAX_ORE_TIER_OFFSET, tierOffsetOfCell } from '../world/worldCell'

const BAND_ONE = 1

export interface MinedOre extends OreCargoTags {
  resourceTier: number
  saleTier: number
  oreId: string
  /** Whole tiles below the surface of the cell's column, as the run log counts depth. */
  depthTiles: number
  /** `cx,cy` of the chunk the cell lay in (`chunkKey`). */
  chunk: string
}

export function minedOreOf(params: PlanetParams, tile: TilePoint, cell: number): MinedOre {
  const resourceTier = resourceTierOf(params, cell)
  const ore = oreTypeOf({ tier: resourceTier, cellFamily: familyOfCell(cell) })
  return {
    resourceTier,
    saleTier: saleTierOf(ore),
    oreId: ore.id,
    ...oreCargoTagsOf(ore),
    depthTiles: depthTilesAt(params, tile.tx, tile.ty),
    chunk: chunkKey(chunkOfTile(tile.tx), chunkOfTile(tile.ty)),
  }
}

/**
 * A cell stores its tier above the planet's band-1 ore (#4, #6): `oreTier(p, 1) + offset`, so a
 * lead cell (#140) may sit above its band's tier. An offset past 6 is a broken cell, never ore.
 */
export function resourceTierOf(params: PlanetParams, cell: number): number {
  return oreTier(params.planetIndex, BAND_ONE) + checkedTierOffsetOf(cell)
}

function checkedTierOffsetOf(cell: number): number {
  const offset = tierOffsetOfCell(cell)
  if (offset > MAX_ORE_TIER_OFFSET) {
    throw new RangeError(
      `an ore cell's tier offset runs from 0 to ${MAX_ORE_TIER_OFFSET}, got ${offset}`,
    )
  }
  return offset
}
