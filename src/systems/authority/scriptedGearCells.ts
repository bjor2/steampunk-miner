/**
 * The cells a scripted bore cuts beyond its tile with the player's drill gear (GD ruling on #392,
 * ticket 392), read without carving: the same gear read `drillTile` runs (`carveCellWithGear`), at
 * the bit a pose report facing the tile would aim, through the same gates. The pacing bot reads
 * them before it bores, so a gear cell never frees a lava pocket its #113 rule keeps shut.
 */
import { drillGearOf } from '../registries/drillGear'
import type { VehiclePose } from '../vehicle/vehiclePose'
import type { PlanetParams } from '../world/planetParams'
import type { TilePoint } from '../world/tileGrid'
import { vehicleOf, type AuthorityState } from './authorityState'
import { cellBitAt, drillGearReadAt } from './drillGearCut'
import { openDrillGates, type DrillGates } from './drillGates'
import { WHOLE_TICK_CLOCK } from './groundDrill'
import { heatThrottledDrill } from './heatRules'
import { shockTicksFor } from './magnetic/electrifiedShock'
import { planetParamsOf } from './planetOfState'

/** A scripted bore: the tile, and the pose reported facing it before the `drillTile`. */
export interface ScriptedBore {
  tile: TilePoint
  pose: VehiclePose
}

/** The gear's ahead cells, then its side cells; none without gear or a generated planet. */
export function scriptedGearCellsOf(
  state: AuthorityState,
  playerId: string,
  bore: ScriptedBore,
): TilePoint[] {
  const params = planetParamsOf(state.planet)
  if (params === null || drillGearOf(state, playerId) === null) return []
  const gates = scriptedDrillGatesOf(state, playerId, params)
  const read = drillGearReadAt(state, params, playerId, cellBitAt(bore.pose, bore.tile), gates)
  return read === null ? [] : [...read.aheadCells, ...read.sideCells]
}

/** The gates a `drillTile` opens: whole-tick cell times at the heat-throttled drill. */
function scriptedDrillGatesOf(
  state: AuthorityState,
  playerId: string,
  params: PlanetParams,
): DrillGates {
  const drill = heatThrottledDrill(params.planetIndex, vehicleOf(state, playerId))
  const cellTicks = WHOLE_TICK_CLOCK.cellTimesOf(params, drill, shockTicksFor(state, playerId))
  return openDrillGates(state, playerId, params, cellTicks)
}
