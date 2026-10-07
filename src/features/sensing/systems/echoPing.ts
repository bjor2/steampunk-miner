/**
 * What one echo sounder ping shows (#162 Sensing row): within its radius around the miner, open
 * cave cells, lava pockets and ore silhouettes, never an ore's tier; a gated ore cell shows its gate
 * badge instead, pointing the player at the extractor or the dynamite (#162 "Shows gated cells
 * with their gate badge"). Fluid ground joins when a planet has it. A pure read of the state, so
 * every client marks the same cells and nothing about the world changes.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import { oreTypeAtTile } from '../../../systems/authority/tileOre'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { CELL_KIND, kindOfCell, type CellKind } from '../../../systems/world/worldCell'
import { cellAt } from '../../../systems/world/worldState'
import { cellGateOf, type CellGateKind } from '../../mining-gates'
import { tilesWithin } from './tileDisc'

export type EchoMarkKind = 'cave' | 'lava' | 'ore' | 'gate'

export interface EchoMark {
  tile: TilePoint
  kind: EchoMarkKind
  /** The badge on a `gate` mark; null on every other kind. */
  gate: Exclude<CellGateKind, 'none'> | null
}

/** Every marked cell of a ping from `origin`, row by row; empty on a session with no world. */
export function echoMarksOf(
  state: AuthorityState,
  origin: TilePoint,
  radiusTiles: number,
): EchoMark[] {
  return tilesWithin(origin, radiusTiles).flatMap((tile) => markOfTile(state, tile))
}

function markOfTile(state: AuthorityState, tile: TilePoint): EchoMark[] {
  const kind = kindAt(state, tile)
  if (kind === CELL_KIND.air) return [{ tile, kind: 'cave', gate: null }]
  if (kind === CELL_KIND.lava) return [{ tile, kind: 'lava', gate: null }]
  if (kind === CELL_KIND.ore) return [oreMarkOf(state, tile)]
  return []
}

function kindAt(state: AuthorityState, tile: TilePoint): CellKind | null {
  const params = planetParamsOf(state.planet)
  return params === null ? null : kindOfCell(cellAt(state.world, params, tile))
}

/** An ore silhouette, or the gate badge of an ore cell a gate holds. */
function oreMarkOf(state: AuthorityState, tile: TilePoint): EchoMark {
  const gate = gateOfOreTile(state, tile)
  return gate === 'none' ? { tile, kind: 'ore', gate: null } : { tile, kind: 'gate', gate }
}

function gateOfOreTile(state: AuthorityState, tile: TilePoint): CellGateKind {
  const params = planetParamsOf(state.planet)
  const ore = oreTypeAtTile(state, tile)
  return params === null || ore === null ? 'none' : cellGateOf(params, tile, ore).kind
}
