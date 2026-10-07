/**
 * The ore a tile holds as a state stands, through `oreTypeOf` (docs/standards/feature-slices.md
 * 3.5). An authority reaction reads it on the state before a command to learn which ore a
 * `DrillDamageDealt` tile was, even when the drill broke it (#207 TD lock, #219): the domain event
 * carries no ore id.
 */
import { oreTypeOf, type OreType } from '../registries/oreTypes'
import type { PlanetParams } from '../world/planetParams'
import type { TilePoint } from '../world/tileGrid'
import { CELL_KIND, familyOfCell, kindOfCell } from '../world/worldCell'
import { cellAt } from '../world/worldState'
import type { AuthorityState } from './authorityState'
import { resourceTierOf } from './minedOre'
import { planetParamsOf } from './planetOfState'

/** Null for a tile that is not ore now, or a session with no world. */
export function oreTypeAtTile(state: AuthorityState, tile: TilePoint): OreType | null {
  const params = planetParamsOf(state.planet)
  return params === null ? null : oreTypeOfCell(params, cellAt(state.world, params, tile))
}

function oreTypeOfCell(params: PlanetParams, cell: number): OreType | null {
  if (kindOfCell(cell) !== CELL_KIND.ore) return null
  return oreTypeOf({ tier: resourceTierOf(params, cell), cellFamily: familyOfCell(cell) })
}
