/**
 * The HUD's blasting charge readouts (#109 design "Visibility" and "Multiplayer"): the charges
 * carried out of the rack's size with the plant key, "2/3 (B)", shown only once the rack is bolted
 * on (#90: nothing before); and the fuse warning every vehicle within `warnTiles` of a live charge
 * sees, its own or another's, with the seconds left and whether it is inside the blast. Text says
 * it, never colour alone (#33 section 7).
 */
import { TICKS_PER_SECOND } from '../../constants/physics'
import type { AuthorityState } from '../authority/authorityState'
import { isInBlastRadius, isInFuseWarning } from '../economy/blastingCharges'
import { boundLabel, type Bindings } from '../input/actionMap'
import {
  chargeCentreMm,
  rackCapacityOf,
  type PlantedCharge,
  type VehicleCharges,
} from '../vehicle/vehicleCharges'
import type { VehiclePose } from '../vehicle/vehiclePose'

export interface ChargeReading {
  carried: number
  capacity: number
  text: string
}

export interface FuseWarning {
  ticksLeft: number
  isInsideBlast: boolean
  text: string
}

/** Null until the rack is bolted on. */
export function chargeReadingOf(charges: VehicleCharges, bindings: Bindings): ChargeReading | null {
  if (!charges.isRackMounted) return null
  const capacity = rackCapacityOf(charges)
  return {
    carried: charges.carried,
    capacity,
    text: `${charges.carried}/${capacity} (${boundLabel(bindings, 'plant_charge')})`,
  }
}

/** The soonest live charge within warning reach of this player's vehicle; null with none. */
export function fuseWarningOf(state: AuthorityState, playerId: string): FuseWarning | null {
  const pose = state.players[playerId].vehicle.pose
  if (pose === null) return null
  const near = liveChargesOf(state).filter((charge) => isWarnedBy(pose, charge))
  if (near.length === 0) return null
  const soonest = near.reduce((first, charge) =>
    charge.detonateTick < first.detonateTick ? charge : first,
  )
  return warningOf(pose, soonest, state.tick)
}

function liveChargesOf(state: AuthorityState): PlantedCharge[] {
  return Object.values(state.players)
    .map((player) => player.vehicle.charges.planted)
    .filter((planted): planted is PlantedCharge => planted !== null)
}

function isWarnedBy(pose: VehiclePose, charge: PlantedCharge): boolean {
  const { dxMm, dyMm } = offsetFrom(pose, charge)
  return isInFuseWarning(dxMm, dyMm)
}

function warningOf(pose: VehiclePose, charge: PlantedCharge, tick: number): FuseWarning {
  const { dxMm, dyMm } = offsetFrom(pose, charge)
  const ticksLeft = Math.max(0, charge.detonateTick - tick)
  const isInsideBlast = isInBlastRadius(dxMm, dyMm)
  return { ticksLeft, isInsideBlast, text: fuseTextOf(ticksLeft, isInsideBlast) }
}

/** "CHARGE LIT 1.5 s: back off" inside the blast, "CHARGE LIT 1.5 s" outside it. */
function fuseTextOf(ticksLeft: number, isInsideBlast: boolean): string {
  const seconds = (ticksLeft / TICKS_PER_SECOND).toFixed(1)
  return `CHARGE LIT ${seconds} s${isInsideBlast ? ': back off' : ''}`
}

function offsetFrom(pose: VehiclePose, charge: PlantedCharge): { dxMm: number; dyMm: number } {
  const centre = chargeCentreMm(charge)
  return { dxMm: pose.x - centre.xMm, dyMm: pose.y - centre.yMm }
}
