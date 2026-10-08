/**
 * The mineral drain's item hook consults (GD lock on #206, TD ruling with the Vertical Scaler's
 * pins; ticket 325): a combo answers the drain's `reach` and `targetOrder` points through the
 * kernel registry, so this lane imports no other slice.
 *
 * - **Reach** is counted in whole cells, the drain's own radius plus the answers, held to
 *   `itemHookCaps.reachCellsMax` (12) by the registry's one clamp.
 * - **Order** ranks only the cells `drainReachOf` found drainable: a hook never adds a cell, so it
 *   never makes air and never takes a gated, too-hard or core cell, which `canMine` and the read
 *   already left out. Ties keep the drain's nearest-first order.
 * - **Income** is not a hook number: what the taken cells pay is still held to the room under the
 *   trip cap (`roomUnderCapOf`) where the take happens.
 *
 * With nothing registered both consults return the drain's own reach and order unchanged.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import {
  rankedCandidatesOf,
  scalarHookValueOf,
  type ItemHookContext,
} from '../../../systems/registries/itemHooks'
import type { TilePoint } from '../../../systems/world/tileGrid'
import type { PowerUpUse } from '../../power-up-core'
import type { DrainableCell } from './drainReach'
import { balanceOf, type ExtractionItem } from './extractionItems'

/** The drain's radius in whole cells after every `reach` hook, never past `reachCellsMax`. */
export function hookedReachOf(state: AuthorityState, use: PowerUpUse, item: ExtractionItem) {
  return scalarHookValueOf(state, use.playerId, {
    point: 'reach',
    parentItemId: item.itemId,
    ctx: hookContextOf(use, item, []),
    base: balanceOf(item).reachTiles,
  })
}

/** The drainable cells, highest summed `targetOrder` score first, then nearest first. */
export function cellsInHookOrder(
  state: AuthorityState,
  use: PowerUpUse,
  item: ExtractionItem,
  cells: readonly DrainableCell[],
): DrainableCell[] {
  const ranked = rankedCandidatesOf(state, use.playerId, {
    point: 'targetOrder',
    parentItemId: item.itemId,
    ctx: hookContextOf(use, item, tilesOf(cells)),
  })
  return cellsOfTiles(cells, ranked)
}

function hookContextOf(
  use: PowerUpUse,
  item: ExtractionItem,
  candidates: readonly TilePoint[],
): ItemHookContext {
  return {
    tick: use.tick,
    mark: use.mark,
    magnitude: use.magnitude ?? balanceOf(item).cellsPerUse,
    origin: use.origin,
    candidates,
  }
}

/** The cell at each ranked tile, in the ranked order; reach tiles are unique, so none is lost. */
function cellsOfTiles(cells: readonly DrainableCell[], ranked: readonly TilePoint[]) {
  const byTile = new Map(cells.map((cell) => [tileKeyOf(cell.tile), cell]))
  return ranked.map((tile) => byTile.get(tileKeyOf(tile)) as DrainableCell)
}

function tilesOf(cells: readonly DrainableCell[]): TilePoint[] {
  return cells.map(({ tile }) => tile)
}

function tileKeyOf({ tx, ty }: TilePoint): string {
  return `${tx},${ty}`
}
