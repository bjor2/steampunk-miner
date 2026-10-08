/**
 * Why `power-up-core.use_power_up` is refused before anything happens (#162 section 2.3: a refused
 * use costs nothing). The checks run in this order, each assuming the ones before it passed. A
 * gate that refuses the act after the wind-up is not here: that is `PowerUpBlocked`.
 *
 * A Mark milestone's follow-up (#256) is refused for the same reasons, but for the cooldown its
 * opener started; a hold also needs its milestone and a use of the slot to follow.
 */
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { firstRejection, rejectionOf, type Rejection } from '../../../systems/authority/commandRule'
import { isSlotOpen, itemInSlot } from '../../../systems/vehicle/loadoutState'
import { isPoseStationary } from '../../../systems/vehicle/vehiclePose'
import type { VehicleState } from '../../../systems/vehicle/vehicleState'
import type { LoadoutSlotId } from '../../../systems/registries/vehicleLoadout'
import { chargesLeftIn, itemChargesOf, powerUpStateOf } from './chargeState'
import { isFollowUpOpen } from './followUps'
import { hasCharges, isUsableFromSlot, powerUpOfItem, type PowerUp } from './powerUpKind'
import { atResearchedMark } from './powerUpMarks'
import { isPressableSlot } from './powerUpSlots'

export function refusalOfUse(
  state: AuthorityState,
  playerId: string,
  slot: string,
  tick: number,
): Rejection | null {
  const vehicle = vehicleOf(state, playerId)
  const slotted = () => slottedPowerUpOf(vehicle, slot as LoadoutSlotId)
  return firstRejection([
    () => slotRefusalOf(slot),
    () => vehicleRefusalOf(vehicle),
    () => lockedRefusalOf(vehicle, slot as LoadoutSlotId),
    () => usableRefusalOf(vehicle, slot as LoadoutSlotId),
    () => busyRefusalOf(state, playerId),
    () => chargesRefusalOf(state, playerId, slotted()),
    () => cooldownRefusalOf(state, playerId, slotted(), slot, tick),
    () => stillnessRefusalOf(vehicle, slotted()),
  ])
}

/** Why `power-up-core.hold_power_up` is refused: a press's reasons, then the hold's own. */
export function refusalOfHold(
  state: AuthorityState,
  playerId: string,
  slot: string,
  tick: number,
): Rejection | null {
  const vehicle = vehicleOf(state, playerId)
  const slotted = () => slottedPowerUpOf(vehicle, slot as LoadoutSlotId) as PowerUp
  return firstRejection([
    () => slotRefusalOf(slot),
    () => vehicleRefusalOf(vehicle),
    () => lockedRefusalOf(vehicle, slot as LoadoutSlotId),
    () => usableRefusalOf(vehicle, slot as LoadoutSlotId),
    () => busyRefusalOf(state, playerId),
    () => holdMilestoneRefusalOf(state, playerId, slotted()),
    () => heldUseRefusalOf(state, playerId, slotted(), slot, tick),
    () => chargesRefusalOf(state, playerId, slotted()),
    () => stillnessRefusalOf(vehicle, slotted()),
  ])
}

/**
 * Why `power-up-core.release_power_up` is refused: only a slot no press reaches (ticket 332).
 * Every other release is accepted, and changes nothing unless it ends a live hold.
 */
export function refusalOfRelease(slot: string): Rejection | null {
  return slotRefusalOf(slot)
}

/** The power-up in the slot, or null when it is empty or holds an item that is not one. */
export function slottedPowerUpOf(vehicle: VehicleState, slot: LoadoutSlotId): PowerUp | null {
  const itemId = itemInSlot(vehicle.loadout, slot)
  return itemId === null ? null : powerUpOfItem(itemId)
}

/** What a slot press would use: the power-up in an open slot that a press uses, else null. */
export function pressablePowerUpOf(vehicle: VehicleState, slot: LoadoutSlotId): PowerUp | null {
  if (!isSlotOpen(vehicle.loadout, slot)) return null
  const powerUp = slottedPowerUpOf(vehicle, slot)
  return powerUp !== null && isUsableFromSlot(powerUp) ? powerUp : null
}

function slotRefusalOf(slot: string): Rejection | null {
  if (isPressableSlot(slot)) return null
  return rejectionOf('power-up-core.not_a_power_up_slot', `no press reaches "${slot}"`)
}

/** A wrecked vehicle uses nothing; a stranded one still may (the ballast is a self-rescue). */
function vehicleRefusalOf(vehicle: VehicleState): Rejection | null {
  if (vehicle.mode !== 'destroyed' && vehicle.pose !== null) return null
  return rejectionOf('power-up-core.vehicle_out_of_play', `the vehicle is ${vehicle.mode}`)
}

function lockedRefusalOf(vehicle: VehicleState, slot: LoadoutSlotId): Rejection | null {
  if (isSlotOpen(vehicle.loadout, slot)) return null
  return rejectionOf('power-up-core.slot_locked', `${slot} needs its cradle`)
}

function usableRefusalOf(vehicle: VehicleState, slot: LoadoutSlotId): Rejection | null {
  const itemId = itemInSlot(vehicle.loadout, slot)
  if (itemId === null) return rejectionOf('power-up-core.slot_empty', `${slot} is empty`)
  const powerUp = powerUpOfItem(itemId)
  if (powerUp !== null && isUsableFromSlot(powerUp)) return null
  return rejectionOf('power-up-core.not_usable', `"${itemId}" is not used from a slot`)
}

/** One use at a time: a wind-up or channel must end first. */
function busyRefusalOf(state: AuthorityState, playerId: string): Rejection | null {
  const pending = powerUpStateOf(state, playerId).pending
  if (pending === null) return null
  return rejectionOf('power-up-core.busy', `"${pending.itemId}" is still acting`)
}

function chargesRefusalOf(
  state: AuthorityState,
  playerId: string,
  powerUp: PowerUp | null,
): Rejection | null {
  if (powerUp === null || !hasCharges(powerUp)) return null
  const marked = atResearchedMark(state, playerId, powerUp)
  if (chargesLeftIn(powerUpStateOf(state, playerId), marked) > 0) return null
  return rejectionOf('power-up-core.no_charges', `"${powerUp.itemId}" has no charges left`)
}

/** A second tap skips, once, the cooldown the use it follows started. */
function cooldownRefusalOf(
  state: AuthorityState,
  playerId: string,
  powerUp: PowerUp | null,
  slot: string,
  tick: number,
): Rejection | null {
  if (powerUp === null) return null
  const value = powerUpStateOf(state, playerId)
  const { readyAtTick } = itemChargesOf(value, powerUp.itemId)
  if (tick >= readyAtTick) return null
  const marked = atResearchedMark(state, playerId, powerUp)
  if (isFollowUpOpen(value, marked, slot, tick, 'second-tap')) return null
  return rejectionOf('power-up-core.cooling_down', `"${powerUp.itemId}" is ready at ${readyAtTick}`)
}

function holdMilestoneRefusalOf(
  state: AuthorityState,
  playerId: string,
  powerUp: PowerUp,
): Rejection | null {
  if (atResearchedMark(state, playerId, powerUp).reachedMilestones.includes('hold')) return null
  return rejectionOf('power-up-core.no_milestone', `"${powerUp.itemId}" has no hold at its Mark`)
}

/** A hold follows a use of the same slot that acted within the window. */
function heldUseRefusalOf(
  state: AuthorityState,
  playerId: string,
  powerUp: PowerUp,
  slot: string,
  tick: number,
): Rejection | null {
  const value = powerUpStateOf(state, playerId)
  const marked = atResearchedMark(state, playerId, powerUp)
  if (isFollowUpOpen(value, marked, slot, tick, 'hold')) return null
  return rejectionOf('power-up-core.nothing_to_hold', `no use of ${slot} to hold past its wind-up`)
}

/** A channel needs the miner to hold still from the start (#162 section 2.1). */
function stillnessRefusalOf(vehicle: VehicleState, powerUp: PowerUp | null): Rejection | null {
  if (powerUp?.powerUpClass !== 'channel' || vehicle.pose === null) return null
  if (isPoseStationary(vehicle.pose)) return null
  return rejectionOf('power-up-core.not_still', `"${powerUp.itemId}" needs the miner to hold still`)
}
