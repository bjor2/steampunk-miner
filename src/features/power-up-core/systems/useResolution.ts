/**
 * A use from press to act (#162 section 2.3, the #200 lock): the press reserves the charge and
 * starts a wind-up (at most 6 ticks, never cancelled) or a channel; the act resolves on the
 * authority clock (`clockSteps`, #217), so the spend logs stay on the authority's ticks.
 *
 * - The item acts: its effect lands, its cooldown starts, `PowerUpUsed` says the charges left.
 * - A gate refuses it: the charge comes back and `PowerUpBlocked` names the cell (a refused use
 *   costs nothing).
 * - It has nothing to act on: the charge comes back and `PowerUpRefused` says why.
 * - A channel whose miner moved: the charge comes back, nothing else changes, `ChannelCancelled`.
 */
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { unchanged, type RuleEffect } from '../../../systems/authority/commandRule'
import { isPoseStationary, tileOfPose } from '../../../systems/vehicle/vehiclePose'
import type { VehicleState } from '../../../systems/vehicle/vehicleState'
import type { LoadoutSlotId } from '../../../systems/registries/vehicleLoadout'
import {
  chargesLeftIn,
  isToggledOn,
  itemChargesOf,
  powerUpStateOf,
  withItemCharges,
  withPending,
  withPowerUpState,
  withToggle,
  type PendingUse,
  type PowerUpState,
} from './chargeState'
import {
  channelCancelledOf,
  powerUpBlockedOf,
  powerUpRefusedOf,
  powerUpUsedOf,
  type UseSubject,
} from './powerUpEvents'
import {
  hasCharges,
  powerUpOfItem,
  ticksToActOf,
  type GateBlock,
  type PowerUp,
  type PowerUpOutcome,
  type PowerUpUse,
} from './powerUpKind'

/** The press: reserve the charge and wait, or act at once for an item with no wind-up. */
export function startUse(
  state: AuthorityState,
  playerId: string,
  powerUp: PowerUp,
  slot: LoadoutSlotId,
  tick: number,
): RuleEffect {
  const pending = pendingUseOf(vehicleOf(state, playerId), powerUp, slot, tick)
  const value = withPending(reserveCharge(powerUpStateOf(state, playerId), powerUp), pending)
  const started = withPowerUpState(state, playerId, value)
  if (pending.actTick > tick) return unchanged(started)
  return resolvePendingUse(started, playerId, tick)
}

/** The pending use's act at `tick`: it acts, or a gate refuses it. */
export function resolvePendingUse(
  state: AuthorityState,
  playerId: string,
  tick: number,
): RuleEffect {
  const value = powerUpStateOf(state, playerId)
  const pending = value.pending as PendingUse
  const powerUp = powerUpOfItem(pending.itemId) as PowerUp
  const cleared = withPowerUpState(state, playerId, withPending(value, null))
  if (isToggleSwitchingOff(value, powerUp)) return switchToggleOff(cleared, playerId, pending)
  const outcome = powerUp.activate(cleared, powerUpUseOf(playerId, pending, tick))
  return effectOfOutcome(cleared, playerId, powerUp, pending, outcome, tick)
}

/**
 * One charge or unit back to an item that spent it, as a cancelled hold gives it back (ticket 204:
 * the rivet patch's own 90-tick timer, the GD lock on #204 Q6). Never below none spent.
 */
export function returnCharge(state: AuthorityState, playerId: string, itemId: string) {
  const powerUp = powerUpOfItem(itemId)
  if (powerUp === null) return state
  return withPowerUpState(state, playerId, refundCharge(powerUpStateOf(state, playerId), powerUp))
}

/** The channel ends with nothing changed but the charge returned. */
export function cancelChannel(state: AuthorityState, playerId: string): RuleEffect {
  const value = powerUpStateOf(state, playerId)
  const pending = value.pending as PendingUse
  const powerUp = powerUpOfItem(pending.itemId) as PowerUp
  const refunded = withPending(refundCharge(value, powerUp), null)
  return {
    state: withPowerUpState(state, playerId, refunded),
    events: [channelCancelledOf(subjectOf(playerId, pending), chargesLeftIn(refunded, powerUp))],
  }
}

/** A channel breaks when the miner leaves the tile it began on, moves, or is wrecked. */
export function isChannelBroken(vehicle: VehicleState, pending: PendingUse): boolean {
  if (pending.kind !== 'channel') return false
  if (vehicle.mode === 'destroyed' || vehicle.pose === null) return true
  return !isPoseStationary(vehicle.pose) || !isOnTile(vehicle, pending.originTx, pending.originTy)
}

function pendingUseOf(
  vehicle: VehicleState,
  powerUp: PowerUp,
  slot: LoadoutSlotId,
  tick: number,
): PendingUse {
  const origin = tileOfPose(vehicle.pose as NonNullable<VehicleState['pose']>)
  return {
    itemId: powerUp.itemId,
    slot,
    kind: powerUp.powerUpClass === 'channel' ? 'channel' : 'windup',
    actTick: tick + ticksToActOf(powerUp),
    originTx: origin.tx,
    originTy: origin.ty,
  }
}

function reserveCharge(value: PowerUpState, powerUp: PowerUp): PowerUpState {
  if (!hasCharges(powerUp)) return value
  const charges = itemChargesOf(value, powerUp.itemId)
  return withItemCharges(value, powerUp.itemId, { ...charges, spent: charges.spent + 1 })
}

/** A dock refill during a channel already returned it, so the count never goes below none spent. */
function refundCharge(value: PowerUpState, powerUp: PowerUp): PowerUpState {
  if (!hasCharges(powerUp)) return value
  const charges = itemChargesOf(value, powerUp.itemId)
  return withItemCharges(value, powerUp.itemId, {
    ...charges,
    spent: Math.max(0, charges.spent - 1),
  })
}

function isToggleSwitchingOff(value: PowerUpState, powerUp: PowerUp): boolean {
  return powerUp.isToggle && isToggledOn(value, powerUp.itemId)
}

function switchToggleOff(state: AuthorityState, playerId: string, pending: PendingUse): RuleEffect {
  const value = withToggle(powerUpStateOf(state, playerId), pending.itemId, false)
  const used = powerUpUsedOf(subjectOf(playerId, pending), originOf(pending), 0)
  return {
    state: withPowerUpState(state, playerId, value),
    events: [{ ...used, toggledOn: false }],
  }
}

function effectOfOutcome(
  state: AuthorityState,
  playerId: string,
  powerUp: PowerUp,
  pending: PendingUse,
  outcome: PowerUpOutcome,
  tick: number,
): RuleEffect {
  if (outcome.kind === 'blocked')
    return refuseByGate(state, playerId, powerUp, pending, outcome.block)
  if (outcome.kind === 'refused')
    return refuseUse(state, playerId, powerUp, pending, outcome.reason)
  return finishActed(outcome.effect, playerId, powerUp, pending, tick)
}

/** Nothing to act on: the charge comes back and no cooldown starts. */
function refuseUse(
  state: AuthorityState,
  playerId: string,
  powerUp: PowerUp,
  pending: PendingUse,
  reason: string,
): RuleEffect {
  const refunded = refundCharge(powerUpStateOf(state, playerId), powerUp)
  return {
    state: withPowerUpState(state, playerId, refunded),
    events: [
      powerUpRefusedOf(subjectOf(playerId, pending), reason, chargesLeftIn(refunded, powerUp)),
    ],
  }
}

function refuseByGate(
  state: AuthorityState,
  playerId: string,
  powerUp: PowerUp,
  pending: PendingUse,
  block: GateBlock,
): RuleEffect {
  const refunded = refundCharge(powerUpStateOf(state, playerId), powerUp)
  return {
    state: withPowerUpState(state, playerId, refunded),
    events: [
      powerUpBlockedOf(subjectOf(playerId, pending), block, chargesLeftIn(refunded, powerUp)),
    ],
  }
}

/** The item's own effect first, then its cooldown, its toggle and the used line. */
function finishActed(
  effect: RuleEffect,
  playerId: string,
  powerUp: PowerUp,
  pending: PendingUse,
  tick: number,
): RuleEffect {
  const value = cooledDown(powerUpStateOf(effect.state, playerId), powerUp, tick)
  const after = powerUp.isToggle ? withToggle(value, powerUp.itemId, true) : value
  const used = powerUpUsedOf(
    subjectOf(playerId, pending),
    originOf(pending),
    chargesLeftIn(after, powerUp),
  )
  return {
    state: withPowerUpState(effect.state, playerId, after),
    events: [...effect.events, powerUp.isToggle ? { ...used, toggledOn: true } : used],
  }
}

function cooledDown(value: PowerUpState, powerUp: PowerUp, tick: number): PowerUpState {
  const charges = itemChargesOf(value, powerUp.itemId)
  return withItemCharges(value, powerUp.itemId, {
    ...charges,
    readyAtTick: tick + powerUp.cooldownTicks,
  })
}

function powerUpUseOf(playerId: string, pending: PendingUse, tick: number): PowerUpUse {
  const { itemId, slot, originTx, originTy } = pending
  return { playerId, itemId, slot, tick, origin: { tx: originTx, ty: originTy } }
}

function subjectOf(playerId: string, pending: PendingUse): UseSubject {
  return { playerId, itemId: pending.itemId, slot: pending.slot }
}

function originOf(pending: PendingUse) {
  return { originTx: pending.originTx, originTy: pending.originTy }
}

function isOnTile(vehicle: VehicleState, tx: number, ty: number): boolean {
  const tile = tileOfPose(vehicle.pose as NonNullable<VehicleState['pose']>)
  return tile.tx === tx && tile.ty === ty
}
