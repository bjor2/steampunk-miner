/**
 * A use from press to act (#162 section 2.3, the #200 lock): the press reserves the charge and
 * starts a wind-up (at most 6 ticks, never cancelled) or a channel; the act resolves on the
 * authority clock (`clockSteps`, #217), so the spend logs stay on the authority's ticks. The item
 * acts at the Mark researched when it acts (#249, `powerUpMarks.ts`).
 *
 * - The item acts: its effect lands, its cooldown starts, `PowerUpUsed` says the charges left;
 *   then its sibling-link fires, once the item's Mark has reached one (ticket 274, `siblingLink.ts`).
 * - A gate refuses it: the charge comes back and `PowerUpBlocked` names the cell (a refused use
 *   costs nothing).
 * - It has nothing to act on: the charge comes back and `PowerUpRefused` says why.
 * - A channel whose miner moved: the charge comes back, nothing else changes, `ChannelCancelled`.
 *
 * A Mark milestone's follow-up (#256, `followUps.ts`) is a use like any other: it reserves its own
 * charge, winds up, and its act reads the pattern from the use; a toggle it follows stays on.
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
  type FollowUpPattern,
  type PendingUse,
  type PowerUpState,
} from './chargeState'
import { withOpenerAfterAct } from './followUps'
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
import { atResearchedMark, type MarkedPowerUp } from './powerUpMarks'
import { withSiblingLink } from './siblingLink'

/** One press, or a milestone's follow-up of the use before it (null for a plain use). */
export interface UseStart {
  powerUp: PowerUp
  slot: LoadoutSlotId
  tick: number
  milestone: FollowUpPattern | null
}

/** The press: reserve the charge and wait, or act at once for an item with no wind-up. */
export function startUse(state: AuthorityState, playerId: string, start: UseStart): RuleEffect {
  const { powerUp, tick } = start
  const pending = pendingUseOf(vehicleOf(state, playerId), start)
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
  const powerUp = atResearchedMark(state, playerId, powerUpOfItem(pending.itemId) as PowerUp)
  const cleared = withPowerUpState(state, playerId, withPending(value, null))
  if (isToggleSwitchingOff(value, powerUp, pending))
    return switchToggleOff(cleared, playerId, pending, powerUp)
  const outcome = powerUp.activate(cleared, powerUpUseOf(playerId, pending, tick, powerUp))
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
  const powerUp = atResearchedMark(state, playerId, powerUpOfItem(pending.itemId) as PowerUp)
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
  { powerUp, slot, tick, milestone }: UseStart,
): PendingUse {
  const origin = tileOfPose(vehicle.pose as NonNullable<VehicleState['pose']>)
  return {
    itemId: powerUp.itemId,
    slot,
    kind: powerUp.powerUpClass === 'channel' ? 'channel' : 'windup',
    actTick: tick + ticksToActOf(powerUp),
    originTx: origin.tx,
    originTy: origin.ty,
    ...(milestone !== null && { milestone }),
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

/** A press of a toggle that is on switches it off, unless it is a milestone's follow-up. */
function isToggleSwitchingOff(value: PowerUpState, powerUp: PowerUp, pending: PendingUse): boolean {
  return powerUp.isToggle && isToggledOn(value, powerUp.itemId) && pending.milestone === undefined
}

function switchToggleOff(
  state: AuthorityState,
  playerId: string,
  pending: PendingUse,
  powerUp: MarkedPowerUp,
): RuleEffect {
  const value = withToggle(powerUpStateOf(state, playerId), pending.itemId, false)
  const used = powerUpUsedOf(subjectOf(playerId, pending), originOf(pending), 0, powerUp.mark)
  return {
    state: withPowerUpState(state, playerId, value),
    events: [{ ...used, toggledOn: false }],
  }
}

function effectOfOutcome(
  state: AuthorityState,
  playerId: string,
  powerUp: MarkedPowerUp,
  pending: PendingUse,
  outcome: PowerUpOutcome,
  tick: number,
): RuleEffect {
  if (outcome.kind === 'blocked')
    return refuseByGate(state, playerId, powerUp, pending, outcome.block)
  if (outcome.kind === 'refused')
    return refuseUse(state, playerId, powerUp, pending, outcome.reason)
  return settleAct(outcome.effect, playerId, powerUp, pending, tick)
}

/** The item's own act first, then its sibling-link fires its sibling (ticket 274), on the act. */
function settleAct(
  effect: RuleEffect,
  playerId: string,
  powerUp: MarkedPowerUp,
  pending: PendingUse,
  tick: number,
): RuleEffect {
  const acted = finishActed(effect, playerId, powerUp, pending, tick)
  return withSiblingLink(acted, powerUpUseOf(playerId, pending, tick, powerUp), powerUp)
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

/**
 * The item's own effect first, then its cooldown at its Mark, its toggle, the follow-up it opens
 * or closes, and the used line.
 */
function finishActed(
  effect: RuleEffect,
  playerId: string,
  powerUp: MarkedPowerUp,
  pending: PendingUse,
  tick: number,
): RuleEffect {
  const after = actedPowerUpState(powerUpStateOf(effect.state, playerId), powerUp, pending, tick)
  return {
    state: withPowerUpState(effect.state, playerId, after),
    events: [
      ...effect.events,
      usedLineOf(playerId, powerUp, pending, chargesLeftIn(after, powerUp)),
    ],
  }
}

function actedPowerUpState(
  value: PowerUpState,
  powerUp: MarkedPowerUp,
  pending: PendingUse,
  tick: number,
): PowerUpState {
  const cooled = cooledDown(value, powerUp, tick)
  const toggled = powerUp.isToggle ? withToggle(cooled, powerUp.itemId, true) : cooled
  return withOpenerAfterAct(toggled, powerUp, pending, tick)
}

function usedLineOf(
  playerId: string,
  powerUp: MarkedPowerUp,
  pending: PendingUse,
  chargesLeft: number,
) {
  const used = powerUpUsedOf(
    subjectOf(playerId, pending),
    originOf(pending),
    chargesLeft,
    powerUp.mark,
  )
  return {
    ...used,
    ...(powerUp.isToggle && { toggledOn: true }),
    ...(pending.milestone !== undefined && { milestone: pending.milestone }),
  }
}

function cooledDown(value: PowerUpState, powerUp: PowerUp, tick: number): PowerUpState {
  const charges = itemChargesOf(value, powerUp.itemId)
  return withItemCharges(value, powerUp.itemId, {
    ...charges,
    readyAtTick: tick + powerUp.cooldownTicks,
  })
}

function powerUpUseOf(
  playerId: string,
  pending: PendingUse,
  tick: number,
  { mark, magnitude }: MarkedPowerUp,
): PowerUpUse {
  const { itemId, slot, originTx, originTy } = pending
  const origin = { tx: originTx, ty: originTy }
  const use = { playerId, itemId, slot, tick, origin, mark, magnitude }
  return pending.milestone === undefined ? use : { ...use, milestone: pending.milestone }
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
