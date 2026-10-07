/**
 * Why `power-up-core.use_power_up` is refused before anything happens (#162 section 2.3: a refused
 * use costs nothing). The checks run in this order, each assuming the ones before it passed. A
 * gate that refuses the act after the wind-up is not here: that is `PowerUpBlocked`.
 */
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { firstRejection, rejectionOf, type Rejection } from '../../../systems/authority/commandRule'
import { isSlotOpen, itemInSlot } from '../../../systems/vehicle/loadoutState'
import { isPoseStationary } from '../../../systems/vehicle/vehiclePose'
import type { VehicleState } from '../../../systems/vehicle/vehicleState'
import type { LoadoutSlotId } from '../../../systems/registries/vehicleLoadout'
import { chargesLeftIn, itemChargesOf, powerUpStateOf } from './chargeState'
import { hasCharges, isUsableFromSlot, powerUpOfItem, type PowerUp } from './powerUpKind'
import { isPowerUpSlot } from './powerUpSlots'

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
    () => cooldownRefusalOf(state, playerId, slotted(), tick),
    () => stillnessRefusalOf(vehicle, slotted()),
  ])
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
  if (isPowerUpSlot(slot)) return null
  return rejectionOf('power-up-core.not_a_power_up_slot', `"${slot}" is not a power-up slot`)
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
  if (chargesLeftIn(powerUpStateOf(state, playerId), powerUp) > 0) return null
  return rejectionOf('power-up-core.no_charges', `"${powerUp.itemId}" has no charges left`)
}

function cooldownRefusalOf(
  state: AuthorityState,
  playerId: string,
  powerUp: PowerUp | null,
  tick: number,
): Rejection | null {
  if (powerUp === null) return null
  const { readyAtTick } = itemChargesOf(powerUpStateOf(state, playerId), powerUp.itemId)
  if (tick >= readyAtTick) return null
  return rejectionOf('power-up-core.cooling_down', `"${powerUp.itemId}" is ready at ${readyAtTick}`)
}

/** A channel needs the miner to hold still from the start (#162 section 2.1). */
function stillnessRefusalOf(vehicle: VehicleState, powerUp: PowerUp | null): Rejection | null {
  if (powerUp?.powerUpClass !== 'channel' || vehicle.pose === null) return null
  if (isPoseStationary(vehicle.pose)) return null
  return rejectionOf('power-up-core.not_still', `"${powerUp.itemId}" needs the miner to hold still`)
}
