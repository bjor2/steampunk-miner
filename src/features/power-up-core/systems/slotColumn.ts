/**
 * The touch slot column as data (#162 section 2.3, #173): one 56 px button for each slot that holds
 * a power-up a press can use, slot 1 first, with its charge pips, cooldown ring and the ring an
 * item's hold fills (ticket 253). An empty or
 * locked slot draws nothing, so a P1 phone still shows just the stick and Interact (#173
 * acceptance 3). Each button reads its item at the player's Mark (#249): its pips, its cooldown
 * and the Mark a brass plate on the cradle will show.
 */
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import type { SlotActionId } from '../../../systems/input/touchControls'
import { chargesLeftIn, isToggledOn, itemChargesOf, powerUpStateOf } from './chargeState'
import type { PowerUpState } from './chargeState'
import { hasCharges, type PowerUp, type SlotHold } from './powerUpKind'
import { atResearchedMark, type MarkedPowerUp } from './powerUpMarks'
import { actionOfSlot, POWER_UP_SLOTS, type PowerUpSlot } from './powerUpSlots'
import { pressablePowerUpOf } from './useRefusals'

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
  /** The share of the item's hold already held, in whole percent: 0 with no hold running. */
  holdPercent: number
  /** Winding up or channelling now. */
  isActing: boolean
  isOn: boolean
  /** The Mark researched, 0 for none: the cradle's brass plate. */
  mark: number
  /** Every stat capped: the gilded plate. */
  isMastered: boolean
}

export function slotButtonsOf(state: AuthorityState, playerId: string): SlotButton[] {
  const vehicle = vehicleOf(state, playerId)
  const value = powerUpStateOf(state, playerId)
  return POWER_UP_SLOTS.flatMap((slot) => {
    const powerUp = pressablePowerUpOf(vehicle, slot)
    if (powerUp === null) return []
    return [slotButtonOf(state, playerId, value, atResearchedMark(state, playerId, powerUp), slot)]
  })
}

function slotButtonOf(
  state: AuthorityState,
  playerId: string,
  value: PowerUpState,
  powerUp: MarkedPowerUp,
  slot: PowerUpSlot,
): SlotButton {
  const { itemId, iconId, name, mark, isMastered } = powerUp
  const { tick } = state
  return {
    slot,
    action: actionOfSlot(slot),
    itemId,
    iconId,
    name,
    chargesLeft: hasCharges(powerUp) ? chargesLeftIn(value, powerUp) : 0,
    chargesMax: hasCharges(powerUp) ? powerUp.charges : 0,
    cooldownPercent: cooldownPercentOf(value, powerUp, tick),
    holdPercent: holdPercentOf(state, playerId, powerUp),
    isActing: value.pending?.itemId === itemId,
    isOn: isToggledOn(value, itemId),
    mark,
    isMastered,
  }
}

function holdPercentOf(state: AuthorityState, playerId: string, powerUp: PowerUp): number {
  const hold = powerUp.holdOf?.(state, playerId) ?? null
  return hold === null ? 0 : heldPercentOf(hold, state.tick)
}

/** Rounded down, so the ring is full only once the hold has run its last tick. */
function heldPercentOf({ startTick, finishTick }: SlotHold, tick: number): number {
  if (finishTick <= startTick) return 0
  const held = Math.min(Math.max(tick - startTick, 0), finishTick - startTick)
  return Math.floor((held * 100) / (finishTick - startTick))
}

/**
 * Out of the cooldown at the current Mark; a cooldown started before a Mark shortened it is
 * still running, so the ring stays full until it is back inside the shorter one.
 */
function cooldownPercentOf(value: PowerUpState, powerUp: MarkedPowerUp, tick: number): number {
  const remaining = itemChargesOf(value, powerUp.itemId).readyAtTick - tick
  if (remaining <= 0 || powerUp.cooldownTicks === 0) return 0
  return Math.min(FULL_PERCENT, Math.ceil((remaining * FULL_PERCENT) / powerUp.cooldownTicks))
}

const FULL_PERCENT = 100
