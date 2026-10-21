/**
 * The species a unit into the hold shows its name by (ticket 695): the one its cell's kind slot
 * binds on the planet (`planetSpeciesOf`), read for the drill's cell only, as the codex reads it
 * (ticket 546) and the rarity is read (`findRarity.ts`). The yielded cell's material stays in
 * the world after its unit is paid, so the state the batch answered still names it. A blast's or
 * a bore's unit names no cell, and a planet with no pool (P8+) binds no species: those show the
 * ore type's own name. Look only: the cargo, the price and the sale never read it.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import type { PlanetParams } from '../../../systems/world/planetParams'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { CELL_KIND, kindOfCell, kindSlotOfCell } from '../../../systems/world/worldCell'
import { materialCellAt } from '../../../systems/world/worldState'
import type { Material } from '../../materials'
import { planetSpeciesOf } from '../../roster'
import { drilledCellBefore } from './drilledCell'

/** The species of the unit `heard[at]` (a `CargoAdded`) brought in; null when it names none. */
export function findSpeciesOf(
  heard: readonly DomainEvent[],
  at: number,
  state: AuthorityState,
): Material | null {
  const cell = drilledCellBefore(heard[at - 1])
  const params = planetParamsOf(state.planet)
  if (cell === null || params === null) return null
  return speciesAtTile(state, params, cell)
}

/** The species an ore cell's kind slot binds; null for any other cell. */
function speciesAtTile(
  state: AuthorityState,
  params: PlanetParams,
  tile: TilePoint,
): Material | null {
  const cell = materialCellAt(state.world, params, tile)
  if (kindOfCell(cell) !== CELL_KIND.ore) return null
  return planetSpeciesOf(params, kindSlotOfCell(cell))
}
