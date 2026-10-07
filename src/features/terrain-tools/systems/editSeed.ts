/**
 * The seed of one terrain edit (#162 section 3.1): a pure function of the planet's seed and index,
 * the origin cell, the activation tick (the lodestone's planting tick), the item and its Mark, so
 * every machine that replays the use names the same cells. Ties between equally near cells are
 * broken by the order-independent cell hash (`cellRandom`), never by `Math.random` or frame time.
 */
import { hashCell } from '../../../systems/cellRandom'
import type { PlanetParams } from '../../../systems/world/planetParams'
import type { TilePoint } from '../../../systems/world/tileGrid'

/** Where, when and by what an edit was asked. */
export interface EditKey {
  origin: TilePoint
  tick: number
  itemId: string
  mark: number
}

export function editSeedOf(params: PlanetParams, key: EditKey): number {
  const planetSeed = hashCell(params.planetSeed, params.planetIndex, key.tick)
  const placed = hashCell(planetSeed, key.origin.tx, key.origin.ty)
  return hashCell(placed, idHashOf(key.itemId), key.mark)
}

/** The tile's place in a tie: the same for one seed whatever order the tiles are asked in. */
export function tieBreakOf(seed: number, tile: TilePoint): number {
  return hashCell(seed, tile.tx, tile.ty)
}

/** FNV-1a 32 over the id's char codes, the integer style of `hashCell` (feature-slices.md 5.2). */
export function idHashOf(id: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < id.length; index += 1) {
    hash = Math.imul(hash ^ id.charCodeAt(index), 0x01000193) >>> 0
  }
  return hash
}
