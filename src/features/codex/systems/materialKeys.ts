/**
 * The species keys one step's events touch (ticket 546, the TD's contact rule 6243331970 as the
 * GD amended it 6243342631, HS's conditions on #450): `material:<species id>` for a cell the player
 * really touched, read on the state before the step, as `oreTypeAtTile` reads the ore:
 *
 * 1. the drill's damage on it (`DrillDamageDealt`),
 * 2. a gate stopping the drill on it (`DrillGated`), that cell only,
 * 3. its unit reaching the hold (`CargoAdded`, the `TileDestroyed` just before it naming the cell),
 * 4. a tool sampling it (`OreSampled`, the corer).
 *
 * Nothing else writes or previews a species: no ahead, neighbouring or behind-gate cell, no
 * reveal of a sensing item and no held item names a cell here. The assay lens is #454's route to
 * the same key, so `OreSampled` by `lens` waits for it. A blast's units follow all of its tiles and
 * name none, so no blast unit is paired with a cell. The species is the cell's kind slot through
 * the planet's roster; a cell with no kind slot (a legacy planet, P8+) names none and old saves
 * get no backfill. Look only: gates, unlocks, ore firsts, artefact picks and prices never read it.
 */
import { AUTHORITY_DEV_FLAGS } from '../../../constants/devFlags'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import type { DiscoveryKey } from '../../../systems/registries/discovery'
import type { PlanetParams } from '../../../systems/world/planetParams'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { CELL_KIND, kindOfCell, kindSlotOfCell } from '../../../systems/world/worldCell'
import { cellAt } from '../../../systems/world/worldState'
import { planetSpeciesOf } from '../../roster'

/** Every species key the events touch, in event order, repeats included; none with the switch off. */
export function materialKeysOf(
  before: AuthorityState,
  heard: readonly DomainEvent[],
): DiscoveryKey[] {
  const params = planetParamsOf(before.planet)
  if (params === null || !AUTHORITY_DEV_FLAGS['codex.materialContact']) return []
  return touchedTilesOf(heard).flatMap((tile) => speciesKeysAt(before, params, tile))
}

function touchedTilesOf(heard: readonly DomainEvent[]): TilePoint[] {
  return heard.flatMap((event, at) => touchedTileOf(event, heard[at - 1]))
}

function touchedTileOf(event: DomainEvent, previous: DomainEvent | undefined): TilePoint[] {
  if (event.type === 'DrillDamageDealt' || event.type === 'DrillGated') return [tileOf(event)]
  if (event.type === 'OreSampled') return event.via === 'lens' ? [] : [tileOf(event)]
  if (event.type === 'CargoAdded') return collectedTileOf(previous)
  return []
}

/** The drill's broken cell a unit came from: it raises `TileDestroyed` with no cause just before. */
function collectedTileOf(previous: DomainEvent | undefined): TilePoint[] {
  const isDrillBroken = previous?.type === 'TileDestroyed' && previous.cause === undefined
  return isDrillBroken ? [tileOf(previous)] : []
}

function tileOf({ tx, ty }: TilePoint): TilePoint {
  return { tx, ty }
}

/** The key of the species an ore cell's kind slot binds; none for any other cell. */
function speciesKeysAt(state: AuthorityState, params: PlanetParams, tile: TilePoint) {
  const cell = cellAt(state.world, params, tile)
  if (kindOfCell(cell) !== CELL_KIND.ore) return []
  const species = planetSpeciesOf(params, kindSlotOfCell(cell))
  return species === null ? [] : [`material:${species.id}` as const]
}
