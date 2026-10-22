/**
 * "Time per tile here" (#7, #33 section 5): how long the drill needs for the intact tile at its
 * nose, from the same `ticksPerCell` the authority drills with. A tip below the cell's scratch
 * floor (a quarter of the hardness, or all of it on a signature, #232) cannot scratch it
 * (`blocked`: "needs a better tip"); air or the indestructible pad in front gives `none`.
 *
 * A sideways cut never passes the drive's speed (Bjor's ruling on #723): where the drill would cut
 * the tile faster, the readout is the drive's time over it, with the effective m/s through the
 * shared number formatter (#681) beside it (`drive`).
 */
import { TICKS_PER_SECOND } from '../../constants/physics'
import type { AuthorityState } from '../authority/authorityState'
import { ticksPerCell } from '../authority/groundDrill'
import { planetParamsOf } from '../authority/planetOfState'
import { formatAmount } from '../displayAmount'
import { fromFiniteNumber } from '../money'
import { isDriveCappedFacing } from '../vehicle/cutAxisCaps'
import { driveSpeedOf } from '../vehicle/cutCapSpeed'
import { noseTileOf, type Facing } from '../vehicle/vehiclePose'
import { statsOfVehicle } from '../vehicle/vehicleState'
import { isRemovableCell } from '../world/worldCell'
import { cellAt } from '../world/worldState'

export type TileTime =
  | { state: 'none'; text: string }
  | { state: 'blocked'; text: string }
  | { state: 'time'; text: string; ticks: number }
  | { state: 'drive'; text: string; ticks: number }

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
  return tileTimeAlong(vehicle.pose.facing, ticks, driveSpeedOf(vehicle))
}

/** The drill's time over the tile, or the drive's where a sideways cut is drive-bound (#723). */
export function tileTimeAlong(facing: Facing, drillTicks: number, driveSpeed: number): TileTime {
  const driveTicks = TICKS_PER_SECOND / driveSpeed
  if (!isDriveCappedFacing(facing) || drillTicks >= driveTicks) {
    return { state: 'time', text: `${secondsText(drillTicks)} s`, ticks: drillTicks }
  }
  return { state: 'drive', text: driveBoundText(driveTicks, driveSpeed), ticks: driveTicks }
}

/** "0.16 s · 6.3 m/s": the drive's time over the tile and the speed it moves at. */
function driveBoundText(driveTicks: number, driveSpeed: number): string {
  return `${secondsText(driveTicks)} s · ${formatAmount(fromFiniteNumber(driveSpeed))} m/s`
}

/** Display only: hundredths of a second, rounded up so a tile never reads faster than it is. */
function secondsText(ticks: number): string {
  const hundredths = Math.ceil((ticks * 100) / TICKS_PER_SECOND)
  return `${Math.floor(hundredths / 100)}.${String(hundredths % 100).padStart(2, '0')}`
}
