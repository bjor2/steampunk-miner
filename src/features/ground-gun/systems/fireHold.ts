/**
 * The client's fire input (ticket 314; Gameplay's recovery feel on the #313 timer and the TD's
 * ruling on 8 Oct): hold-fire and the tap buffer live only here, never in the authority. The
 * client reads the authority's `nextShotTick` and sends `ground_gun.fire` on the first tick it
 * allows, so the command log records the shot at the tick it was allowed and replays and bot runs
 * stay deterministic; the authority never stores a queued shot.
 *
 * - Held, the gun fires on the first tick `nextShotTick` allows, then again on each next one.
 * - An early tap waits up to `tapBufferTicks` for the recovery to end, then is dropped silently.
 * - A sent shot is not sent again until the authority's clock moves past it, so a slow answer
 *   never doubles a shot.
 * - A `recovering` refusal (lag in co-op) stays silent and keeps the input as it was; any other
 *   refusal is a blocked shot: it clanks, and the hold lets go so it never clanks every tick.
 *
 * Pure: ticks in, the decision out.
 */
import { GROUND_GUN } from './groundGunEconomy'

export interface FireHold {
  /** The fire tile or button is down. */
  isHeld: boolean
  /** The bearing the next shot is sent along, already snapped into the arc. */
  bearing: number
  /** An early tap waits for the recovery until this tick; null with none waiting. */
  tapExpiresTick: number | null
  /** The tick the last shot was sent, until the authority's clock moves past it. */
  sentTick: number | null
}

export const IDLE_FIRE: FireHold = {
  isHeld: false,
  bearing: 0,
  tapExpiresTick: null,
  sentTick: null,
}

/** The refusal a held gun shrugs off: the recovery timer, still running. */
export const RECOVERING_REASON = 'recovering'

export function heldFire(hold: FireHold, bearing: number): FireHold {
  return { ...hold, isHeld: true, bearing }
}

export function releasedFire(hold: FireHold): FireHold {
  return { ...hold, isHeld: false }
}

export function aimedFire(hold: FireHold, bearing: number): FireHold {
  return { ...hold, bearing }
}

/** A tap: sent on the next allowed tick if that comes within the buffer, else forgotten. */
export function tappedFire(hold: FireHold, bearing: number, tick: number): FireHold {
  return { ...hold, bearing, tapExpiresTick: tick + GROUND_GUN.input.tapBufferTicks }
}

/** Whether a shot goes out at `tick`, given the authority's `nextShotTick`. */
export function isFireDue(hold: FireHold, tick: number, nextShotTick: number): boolean {
  if (tick < nextShotTick || isAwaitingAnswer(hold, nextShotTick)) return false
  return hold.isHeld || isTapWaiting(hold, tick)
}

/** The hold once a shot went out at `tick`: the tap is spent. */
export function sentFire(hold: FireHold, tick: number): FireHold {
  return { ...hold, sentTick: tick, tapExpiresTick: null }
}

/**
 * The hold at `tick`, read each frame before `isFireDue`: a tap past its buffer is dropped,
 * silently, and a sent shot whose `nextShotTick` the authority has moved on is answered (the
 * shot's bore later leaves the state, so the answer is noted while it shows).
 */
export function agedFire(hold: FireHold, tick: number, nextShotTick: number): FireHold {
  return answeredFire(withoutStaleTap(hold, tick), nextShotTick)
}

function withoutStaleTap(hold: FireHold, tick: number): FireHold {
  if (hold.tapExpiresTick === null || tick <= hold.tapExpiresTick) return hold
  return { ...hold, tapExpiresTick: null }
}

function answeredFire(hold: FireHold, nextShotTick: number): FireHold {
  if (hold.sentTick === null || nextShotTick <= hold.sentTick) return hold
  return { ...hold, sentTick: null }
}

/** The hold after the authority refused a shot for `reason`. */
export function refusedFire(hold: FireHold, reason: string): FireHold {
  if (!isClankRefusal(reason)) return { ...hold, sentTick: null }
  return { ...IDLE_FIRE, bearing: hold.bearing }
}

/** Every refusal but the recovery clanks: the clank means a blocked shot. */
export function isClankRefusal(reason: string): boolean {
  return reason !== RECOVERING_REASON
}

function isTapWaiting(hold: FireHold, tick: number): boolean {
  return hold.tapExpiresTick !== null && tick <= hold.tapExpiresTick
}

/** A sent shot the authority has not answered yet. */
function isAwaitingAnswer(hold: FireHold, nextShotTick: number): boolean {
  return hold.sentTick !== null && nextShotTick <= hold.sentTick
}

/** What one frame at `tick` does: the hold it leaves, and the bearing to send now, if any. */
export interface FireStep {
  hold: FireHold
  shotBearing: number | null
}

export function fireStepAt(hold: FireHold, tick: number, nextShotTick: number): FireStep {
  const aged = agedFire(hold, tick, nextShotTick)
  if (!isFireDue(aged, tick, nextShotTick)) return { hold: aged, shotBearing: null }
  return { hold: sentFire(aged, tick), shotBearing: aged.bearing }
}
