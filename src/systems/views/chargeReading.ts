/**
 * The HUD's blasting charge readouts (#109 design "Visibility" and "Multiplayer"): the rack slots
 * its charges fill out of its size with the plant key, "2/3 (B)" (one slot a size-1 charge, more
 * for the bigger sizes, K8 #218), shown only once the rack is bolted on (#90: nothing before); and
 * the fuse warning every vehicle within `warnTiles` of a lit fuse sees, its own or another's, with
 * the seconds left and whether it is inside the blast. A remote charge has no fuse to warn of.
 * Text says it, never colour alone (#33 section 7).
 */
import { TICKS_PER_SECOND } from '../../constants/physics'
import type { AuthorityState } from '../authority/authorityState'
import { liveChargesOf } from '../authority/charges/chargeRules'
import { isInFuseWarning } from '../economy/blastingCharges'
import { isInChargeRadius } from '../economy/chargeSizes'
import { boundLabel, type Bindings } from '../input/actionMap'
import {
  chargeCentreMm,
  rackCapacityOf,
  rackSlotsUsedOf,
  totalCarriedOf,
  type PlantedCharge,
  type VehicleCharges,
} from '../vehicle/vehicleCharges'
import type { VehiclePose } from '../vehicle/vehiclePose'

export interface ChargeReading {
  /** Charges in the rack, of every size. */
  carried: number
  /** The rack's slots. */
  capacity: number
  text: string
}

/** A planted charge with a lit fuse: every charge but a remote one. */
type FusedCharge = PlantedCharge & { detonateTick: number }

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
    carried: totalCarriedOf(charges),
    capacity,
    text: `${rackSlotsUsedOf(charges)}/${capacity} (${boundLabel(bindings, 'plant_charge')})`,
  }
}

/** The soonest live charge within warning reach of this player's vehicle; null with none. */
export function fuseWarningOf(state: AuthorityState, playerId: string): FuseWarning | null {
  const pose = state.players[playerId].vehicle.pose
  if (pose === null) return null
  const near = liveChargesOf(state)
    .filter(isFused)
    .filter((charge) => isWarnedBy(pose, charge))
  if (near.length === 0) return null
  const soonest = near.reduce((first, charge) =>
    charge.detonateTick < first.detonateTick ? charge : first,
  )
  return warningOf(pose, soonest, state.tick)
}

function isFused(charge: PlantedCharge): charge is FusedCharge {
  return charge.detonateTick !== null
}

function isWarnedBy(pose: VehiclePose, charge: PlantedCharge): boolean {
  const { dxMm, dyMm } = offsetFrom(pose, charge)
  return isInFuseWarning(dxMm, dyMm)
}

function warningOf(pose: VehiclePose, charge: FusedCharge, tick: number): FuseWarning {
  const { dxMm, dyMm } = offsetFrom(pose, charge)
  const ticksLeft = Math.max(0, charge.detonateTick - tick)
  const isInsideBlast = isInChargeRadius(charge.size, dxMm, dyMm)
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
