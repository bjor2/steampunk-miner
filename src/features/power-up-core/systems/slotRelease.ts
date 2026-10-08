/**
 * Letting go of a slot (ticket 332, the TD ruling on #285 section 3): `release_power_up {slot}`
 * ends the live hold of an item used by holding it, through the item's `release`, and says so
 * with `PowerUpReleased`. The authority owns the release tick, so the item's hold end, its
 * cooldown start and its per-tick drain are the same in replay and for every peer.
 *
 * - During the slot's wind-up the release is kept on the pending use (`releasedTick`), and the
 *   item's `release` runs on the act tick right after `activate`: a quick tap never gives a
 *   full-length hold.
 * - Anything else is accepted and changes nothing, with no event: an empty slot, an item with no
 *   `release`, no live hold, or a second release. A key let go as a hold ends by itself is play.
 *
 * A live hold is the item's `holdOf` answering a hold whose `finishTick` is still ahead.
 */
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { unchanged, type RuleEffect } from '../../../systems/authority/commandRule'
import type { LoadoutSlotId } from '../../../systems/registries/vehicleLoadout'
import {
  itemChargesOf,
  powerUpStateOf,
  withItemCharges,
  withPending,
  withPowerUpState,
  type PendingUse,
} from './chargeState'
import { powerUpReleasedOf } from './powerUpEvents'
import { isUsedByHolding, powerUpOfItem, type PowerUp } from './powerUpKind'
import { powerUpAtMarkOf } from './powerUpMarks'
import { slottedPowerUpOf } from './useRefusals'

/** The release command's effect: kept for the act, a live hold ended, or nothing at all. */
export function releaseSlot(
  state: AuthorityState,
  playerId: string,
  slot: LoadoutSlotId,
  tick: number,
): RuleEffect {
  const powerUp = slottedPowerUpOf(vehicleOf(state, playerId), slot)
  if (powerUp === null || !isUsedByHolding(powerUp)) return unchanged(state)
  return isWindingUp(state, playerId, powerUp, slot)
    ? keepReleaseForAct(state, playerId, tick)
    : releaseLiveHold(state, playerId, powerUp, slot, tick)
}

/**
 * The pending use's act has just landed: a release kept during its wind-up now ends the hold the
 * act started, on the act tick.
 */
export function releaseKeptAtAct(
  effect: RuleEffect,
  playerId: string,
  pending: PendingUse,
  tick: number,
): RuleEffect {
  const powerUp = powerUpOfItem(pending.itemId)
  if (pending.releasedTick === undefined || powerUp === null) return effect
  const released = releaseLiveHold(effect.state, playerId, powerUp, pending.slot, tick)
  return { state: released.state, events: [...effect.events, ...released.events] }
}

/**
 * The item's cooldown restarted from `tick`, at the player's Mark: a hold's slice calls it with
 * the tick its hold ended (by release or by running its length), so the cooldown counts from the
 * hold's end, not from the act (the GD guard on #285).
 */
export function startCooldownAt(
  state: AuthorityState,
  playerId: string,
  itemId: string,
  tick: number,
): AuthorityState {
  const powerUp = powerUpAtMarkOf(state, playerId, itemId)
  if (powerUp === null) return state
  const value = powerUpStateOf(state, playerId)
  const charges = { ...itemChargesOf(value, itemId), readyAtTick: tick + powerUp.cooldownTicks }
  return withPowerUpState(state, playerId, withItemCharges(value, itemId, charges))
}

/** Whether the slot's item is winding up, channelling or holding now: its press started a use. */
export function isSlotInUse(state: AuthorityState, playerId: string, slot: LoadoutSlotId): boolean {
  if (powerUpStateOf(state, playerId).pending?.slot === slot) return true
  const powerUp = slottedPowerUpOf(vehicleOf(state, playerId), slot)
  return powerUp !== null && isHoldLive(state, playerId, powerUp, state.tick)
}

function isWindingUp(
  state: AuthorityState,
  playerId: string,
  powerUp: PowerUp,
  slot: LoadoutSlotId,
): boolean {
  const pending = powerUpStateOf(state, playerId).pending
  return pending !== null && pending.slot === slot && pending.itemId === powerUp.itemId
}

/** A second release during the wind-up keeps the first one's tick. */
function keepReleaseForAct(state: AuthorityState, playerId: string, tick: number): RuleEffect {
  const value = powerUpStateOf(state, playerId)
  const pending = value.pending as PendingUse
  if (pending.releasedTick !== undefined) return unchanged(state)
  const kept = withPending(value, { ...pending, releasedTick: tick })
  return unchanged(withPowerUpState(state, playerId, kept))
}

function releaseLiveHold(
  state: AuthorityState,
  playerId: string,
  powerUp: PowerUp,
  slot: LoadoutSlotId,
  tick: number,
): RuleEffect {
  if (!isHoldLive(state, playerId, powerUp, tick)) return unchanged(state)
  const outcome = (powerUp.release as NonNullable<PowerUp['release']>)(state, {
    playerId,
    slot,
    tick,
  })
  if (outcome.kind !== 'acted') return unchanged(state)
  const released = powerUpReleasedOf({ playerId, itemId: powerUp.itemId, slot })
  return { state: outcome.effect.state, events: [...outcome.effect.events, released] }
}

function isHoldLive(
  state: AuthorityState,
  playerId: string,
  powerUp: PowerUp,
  tick: number,
): boolean {
  const hold = powerUp.holdOf?.(state, playerId) ?? null
  return hold !== null && tick < hold.finishTick
}
