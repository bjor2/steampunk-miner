/**
 * "Time per tile here" (#7, #33 section 5): how long the drill needs for the intact tile at its
 * nose, from the same `ticksPerCell` the authority drills with. A tip below the cell's scratch
 * floor (a quarter of the hardness, or all of it on a signature, #232) cannot scratch it
 * (`blocked`: "needs a better tip"); air or the indestructible pad in front gives `none`.
 */
import { TICKS_PER_SECOND } from '../../constants/physics'
import type { AuthorityState } from '../authority/authorityState'
import { ticksPerCell } from '../authority/groundDrill'
import { planetParamsOf } from '../authority/planetOfState'
import { noseTileOf } from '../vehicle/vehiclePose'
import { statsOfVehicle } from '../vehicle/vehicleState'
import { isRemovableCell } from '../world/worldCell'
import { cellAt } from '../world/worldState'

export type TileTime =
  | { state: 'none'; text: string }
  | { state: 'blocked'; text: string }
  | { state: 'time'; text: string; ticks: number }

const NO_TILE: TileTime = { state: 'none', text: '-' }
const BLOCKED: TileTime = { state: 'blocked', text: 'needs a better tip' }

export function tileTimeAhead(state: AuthorityState, playerId: string): TileTime {
  const vehicle = state.players[playerId].vehicle
  const params = planetParamsOf(state.planet)
  if (vehicle.pose === null || params === null) return NO_TILE
  const tile = noseTileOf(vehicle.pose)
  const cell = cellAt(state.world, params, tile)
  if (!isRemovableCell(cell)) return NO_TILE
  const ticks = ticksPerCell(statsOfVehicle(vehicle), params, tile, cell)
  if (ticks === null) return BLOCKED
  return { state: 'time', text: `${secondsText(ticks)} s`, ticks }
}

/** Display only: hundredths of a second, rounded up so a tile never reads faster than it is. */
function secondsText(ticks: number): string {
  const hundredths = Math.ceil((ticks * 100) / TICKS_PER_SECOND)
  return `${Math.floor(hundredths / 100)}.${String(hundredths % 100).padStart(2, '0')}`
}
