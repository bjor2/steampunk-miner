/**
 * Hazard clears (ticket 882, PK4c T2; Systems' flask row on #850, 6395065669): a slice may clear a
 * hazard kind from cells for a while, a flag cleared, never a cell deleted. While a clear answers
 * for a cell, the cell holds no hazard as the authority reads it (`hazardCells.ts`): no contact,
 * no drain, no tool context, for every player alike. The planet's pocket and the cell's material
 * stay as they are, so the hazard is back the tick the clear ends.
 *
 * With none registered every cell reads as before.
 */
import type { AuthorityState } from '../authority/authorityState'
import type { TilePoint } from '../world/tileGrid'
import { defineRegistry, entriesOf } from './seal'

export interface HazardClear {
  /** `<slice>.<clear>`. */
  id: string
  /** The hazard kind it clears. */
  kind: string
  /** Whether the kind is cleared from `tile` at the state's tick. */
  isClearedAt(state: AuthorityState, tile: TilePoint): boolean
}

export const HAZARD_CLEAR_REGISTRY = defineRegistry<HazardClear>('hazardClears')

/** Whether a registered clear holds `kind` off `tile` now. */
export function isHazardClearedAt(state: AuthorityState, tile: TilePoint, kind: string): boolean {
  return entriesOf(HAZARD_CLEAR_REGISTRY).some(
    (clear) => clear.kind === kind && clear.isClearedAt(state, tile),
  )
}
