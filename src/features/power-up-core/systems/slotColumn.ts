/**
 * The touch slot column as data (#162 section 2.3, #173): one 56 px button for each slot that holds
 * a power-up a press can use, slot 1 first, with its charge pips and cooldown ring. An empty or
 * locked slot draws nothing, so a P1 phone still shows just the stick and Interact (#173
 * acceptance 3).
 */
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import type { SlotActionId } from '../../../systems/input/touchControls'
import { chargesLeftIn, isToggledOn, itemChargesOf, powerUpStateOf } from './chargeState'
import type { PowerUpState } from './chargeState'
import { hasCharges, isUsableFromSlot, type PowerUp } from './powerUpKind'
import { actionOfSlot, POWER_UP_SLOTS, type PowerUpSlot } from './powerUpSlots'
import { slottedPowerUpOf } from './useRefusals'

export interface SlotButton {
  slot: PowerUpSlot
  action: SlotActionId
  itemId: string
  iconId: string
  name: string
  /** One pip per charge; 0 and 0 for a toggle. */
  chargesLeft: number
  chargesMax: number
  /** The share of the cooldown still to run, in whole percent: 0 when ready. */
  cooldownPercent: number
  /** Winding up or channelling now. */
  isActing: boolean
  isOn: boolean
}

export function slotButtonsOf(state: AuthorityState, playerId: string): SlotButton[] {
  const vehicle = vehicleOf(state, playerId)
  const value = powerUpStateOf(state, playerId)
  return POWER_UP_SLOTS.flatMap((slot) => {
    const powerUp = slottedPowerUpOf(vehicle, slot)
    if (powerUp === null || !isUsableFromSlot(powerUp)) return []
    return [slotButtonOf(value, powerUp, slot, state.tick)]
  })
}

function slotButtonOf(
  value: PowerUpState,
  powerUp: PowerUp,
  slot: PowerUpSlot,
  tick: number,
): SlotButton {
  const { itemId, iconId, name } = powerUp
  return {
    slot,
    action: actionOfSlot(slot),
    itemId,
    iconId,
    name,
    chargesLeft: hasCharges(powerUp) ? chargesLeftIn(value, powerUp) : 0,
    chargesMax: hasCharges(powerUp) ? powerUp.charges : 0,
    cooldownPercent: cooldownPercentOf(value, powerUp, tick),
    isActing: value.pending?.itemId === itemId,
    isOn: isToggledOn(value, itemId),
  }
}

function cooldownPercentOf(value: PowerUpState, powerUp: PowerUp, tick: number): number {
  const remaining = itemChargesOf(value, powerUp.itemId).readyAtTick - tick
  if (remaining <= 0 || powerUp.cooldownTicks === 0) return 0
  return Math.ceil((remaining * 100) / powerUp.cooldownTicks)
}
