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
 * `CargoAdded`, whose `resourceTier` is the cell's own. So does `band`, the band of the cell's tile,
 * which the ore pickup seam reads (ticket 509), and `kindSlot`, which the ore premium seam reads
 * (ticket 844). A gem kind's unit is kept at the gem's own tier
 * (ticket 713), read from the cell's kind slot by `oreTypeOfCell`.
 */
import { oreTier } from '../economy/oreEconomy'
import { bandOfTile, depthTilesAt } from '../world/planetGeometry'
import type { PlanetParams } from '../world/planetParams'
import {
  oreCargoTagsOf,
  oreTypeOf,
  saleTierOf,
  withGemTag,
  type OreCargoTags,
  type OreType,
} from '../registries/oreTypes'
import { chunkKey, chunkOfTile, type TilePoint } from '../world/tileGrid'
import {
  familyOfCell,
  kindSlotOfCell,
  MAX_ORE_TIER_OFFSET,
  tierOffsetOfCell,
} from '../world/worldCell'

const BAND_ONE = 1

export interface MinedOre extends OreCargoTags {
  resourceTier: number
  saleTier: number
  /** Set on a gem's unit (ticket 741): it sells at its own tier, which no rarity clamp holds. */
  gem?: true
  /** The band of the tile the cell lay in. */
  band: number
  oreId: string
  /** Whole tiles below the surface of the cell's column, as the run log counts depth. */
  depthTiles: number
  /** `cx,cy` of the chunk the cell lay in (`chunkKey`). */
  chunk: string
  /** The cell's stored kind slot (0 for none), which the ore premium seam reads (ticket 844). */
  kindSlot: number
}

export function minedOreOf(params: PlanetParams, tile: TilePoint, cell: number): MinedOre {
  const ore = oreTypeOfCell(params, cell)
  return {
    resourceTier: ore.tier,
    saleTier: saleTierOf(ore),
    ...(ore.gem === true ? { gem: true } : {}),
    band: bandOfTile(params, tile.tx, tile.ty),
    oreId: ore.id,
    ...oreCargoTagsOf(ore),
    depthTiles: depthTilesAt(params, tile.tx, tile.ty),
    chunk: chunkKey(chunkOfTile(tile.tx), chunkOfTile(tile.ty)),
    kindSlot: kindSlotOfCell(cell),
  }
}

/**
 * The ore an ore cell holds, as it is kept and sold: `oreTypeOf` its tier and family, with the gem
 * tags folded over its kind slot (ticket 713).
 */
export function oreTypeOfCell(params: PlanetParams, cell: number): OreType {
  const ore = oreTypeOf({ tier: resourceTierOf(params, cell), cellFamily: familyOfCell(cell) })
  return withGemTag(ore, params, kindSlotOfCell(cell))
}

/**
 * A cell stores its tier above the planet's band-1 ore (#4, #6): `oreTier(p, 1) + offset`, so a
 * lead cell (#140) may sit above its band's tier. An offset past 8 (band 5's ore plus mythic's
 * +4, ticket 445) is a broken cell, never ore.
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
