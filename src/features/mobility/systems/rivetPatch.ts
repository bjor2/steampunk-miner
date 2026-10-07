/**
 * The rivet patch's hold (#162 4.3, the GD lock on #204 Q6, G&V's definition on #204): after its
 * wind-up the patch holds for 90 ticks, then plates +25% of `hullMax` on, never past it. Moving
 * during the hold cancels it and gives the unit back.
 *
 * "Moving" is any movement or drill input, or a speed above 0.5 cells/s; slow drift from gravity
 * or a settling slope is not. The authority keeps no record of a report's input, but every input
 * costs energy (drive, thrust and drill each bill the tank per tick), so the hold watches the
 * tank: each tick it expects the tank the toggles' draw will leave, and finding less means the
 * player spent some. Docking or a wreck ends the hold the same way.
 *
 * While it holds, the slot's ring fills (`holdOf`); a cancel clanks lightly and a finish chimes
 * (`slotHoldCues`, ticket 253).
 *
 * The plate is the kit's magnitude at the Mark researched when the hold finishes (#249): the hold
 * keeps no number of its own, so a Mark bought in the field during the 90 ticks plates at the new
 * Mark.
 */
import { BASIS_POINTS } from '../../../constants/balance'
import {
  vehicleOf,
  withVehicle,
  type AuthorityState,
} from '../../../systems/authority/authorityState'
import { unchanged, type RuleEffect } from '../../../systems/authority/commandRule'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import type { SlotHoldCueSource, SlotHoldEnd } from '../../../systems/registries/slotHoldCues'
import { cmp, div, fromSafeInteger, mul, add, sub, type BigStat } from '../../../systems/money'
import type { VehiclePose } from '../../../systems/vehicle/vehiclePose'
import { statsOfVehicle, type VehicleState } from '../../../systems/vehicle/vehicleState'
import {
  chargesLeftOf,
  powerUpAtMarkOf,
  returnCharge,
  toggleDrawQuantaOf,
  type SlotHold,
} from '../../power-up-core'
import { MOBILITY_ITEM } from './itemIds'
import { MOBILITY_ECONOMY } from './mobilityEconomy'
import { hullPatchedOf, patchCancelledOf } from './mobilityEvents'
import { mobilityOf, updateMobility, type RivetHold } from './mobilitySection'

const NUMBERS = MOBILITY_ECONOMY.rivetPatch

/** The hold at `tick`: cancelled by a move, finished at its tick, or watched one tick more. */
export function settleRivetHold(state: AuthorityState, playerId: string, tick: number): RuleEffect {
  const patch = mobilityOf(state, playerId).patch
  if (patch === null) return unchanged(state)
  if (hasMovedDuring(vehicleOf(state, playerId), patch)) return cancelRivetHold(state, playerId)
  if (tick >= patch.finishTick) return finishRivetHold(state, playerId)
  return unchanged(watchNextTick(state, playerId, patch))
}

/** The hold running now, from the end of the wind-up to its finish tick, for the slot's ring. */
export function rivetHoldOf(state: AuthorityState, playerId: string): SlotHold | null {
  const patch = mobilityOf(state, playerId).patch
  if (patch === null) return null
  return { startTick: patch.finishTick - NUMBERS.holdTicks, finishTick: patch.finishTick }
}

/** A cancel clanks and a finish chimes (G&V on #204). */
export const RIVET_HOLD_CUES: SlotHoldCueSource = {
  id: 'mobility.rivet-patch',
  holdEndOf: rivetHoldEndOf,
}

function rivetHoldEndOf(event: DomainEvent): SlotHoldEnd | null {
  if (event.type === 'mobility.PatchCancelled') return 'cancelled'
  return event.type === 'mobility.HullPatched' ? 'finished' : null
}

function hasMovedDuring(vehicle: VehicleState, patch: RivetHold): boolean {
  if (vehicle.mode === 'docked' || vehicle.mode === 'destroyed' || vehicle.pose === null) {
    return true
  }
  return isFasterThanDrift(vehicle.pose) || vehicle.energy < patch.expectedEnergy
}

function isFasterThanDrift(pose: VehiclePose): boolean {
  const limit = NUMBERS.movingSpeedMmPerS
  return pose.vx * pose.vx + pose.vy * pose.vy > limit * limit
}

function watchNextTick(state: AuthorityState, playerId: string, patch: RivetHold) {
  const expectedEnergy = Math.max(
    0,
    vehicleOf(state, playerId).energy - toggleDrawQuantaOf(state, playerId),
  )
  return updateMobility(state, playerId, (value) => ({
    ...value,
    patch: { ...patch, expectedEnergy },
  }))
}

function cancelRivetHold(state: AuthorityState, playerId: string): RuleEffect {
  const cleared = updateMobility(state, playerId, (value) => ({ ...value, patch: null }))
  const refunded = returnCharge(cleared, playerId, MOBILITY_ITEM.rivetPatch)
  return {
    state: refunded,
    events: [
      patchCancelledOf(playerId, chargesLeftOf(refunded, playerId, MOBILITY_ITEM.rivetPatch)),
    ],
  }
}

function finishRivetHold(state: AuthorityState, playerId: string): RuleEffect {
  const vehicle = vehicleOf(state, playerId)
  const hullAfter = patchedHullOf(vehicle, plateShareBpOf(state, playerId))
  const cleared = updateMobility(state, playerId, (value) => ({ ...value, patch: null }))
  return {
    state: withVehicle(cleared, playerId, { ...vehicleOf(cleared, playerId), hull: hullAfter }),
    events: [hullPatchedOf(playerId, sub(hullAfter, vehicle.hull), hullAfter)],
  }
}

/** The share of `hullMax` the kit plates on at the player's Mark, in basis points. */
function plateShareBpOf(state: AuthorityState, playerId: string): number {
  return (
    powerUpAtMarkOf(state, playerId, MOBILITY_ITEM.rivetPatch)?.magnitude ?? NUMBERS.hullShareBp
  )
}

/** The hull with a share of its maximum plated on, never past the maximum. */
function patchedHullOf(vehicle: VehicleState, shareBp: number): BigStat {
  const hullMax = statsOfVehicle(vehicle).hullMax
  const plate = div(mul(hullMax, fromSafeInteger(shareBp)), fromSafeInteger(BASIS_POINTS))
  const patched = add(vehicle.hull, plate)
  return cmp(patched, hullMax) > 0 ? hullMax : patched
}
