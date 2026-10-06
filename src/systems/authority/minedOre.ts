/**
 * Which ore a mined cell held, as `CargoAdded` reports it (#122, step 2 of the logging rollout in
 * #104): its tier, its ore id, how deep the cell lay and the chunk it lay in, so the run log can
 * list the minerals in the order they were mined and line them up against perf samples.
 *
 * `oreId` is the one field #155 names for this, shared with the ore catalogue (#146): the
 * `oreTypeOf({tier, cellFamily}).id` of docs/standards/feature-slices.md 3.5, which is the kernel
 * default `kernel.<family>.t<tier>` until the `ores` slice provides a catalogue.
 */
import { oreTier } from '../economy/oreEconomy'
import { depthTilesAt } from '../world/planetGeometry'
import type { PlanetParams } from '../world/planetParams'
import { oreTypeOf } from '../registries/oreTypes'
import { chunkKey, chunkOfTile, type TilePoint } from '../world/tileGrid'
import { familyOfCell, tierOffsetOfCell } from '../world/worldCell'

export interface MinedOre {
  resourceTier: number
  oreId: string
  /** Whole tiles below the surface of the cell's column, as the run log counts depth. */
  depthTiles: number
  /** `cx,cy` of the chunk the cell lay in (`chunkKey`). */
  chunk: string
}

export function minedOreOf(params: PlanetParams, tile: TilePoint, cell: number): MinedOre {
  const resourceTier = resourceTierOf(params, cell)
  return {
    resourceTier,
    oreId: oreTypeOf({ tier: resourceTier, cellFamily: familyOfCell(cell) }).id,
    depthTiles: depthTilesAt(params, tile.tx, tile.ty),
    chunk: chunkKey(chunkOfTile(tile.tx), chunkOfTile(tile.ty)),
  }
}

/** A cell stores its tier above the planet's band-1 ore (#4, #6). */
export function resourceTierOf(params: PlanetParams, cell: number): number {
  return oreTier(params.planetIndex, 1 + tierOffsetOfCell(cell))
}
