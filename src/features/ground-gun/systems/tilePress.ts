/**
 * A finger on the fire tile (ticket 314; #309 Gameplay's touch input on the #313 recovery): what
 * a press means is only known once it moves or lets go, so it starts pending.
 *
 * - A quick tap fires along the facing on release.
 * - A press held `holdFireTicks` without a drag is a held gun: it fires on each tick the recovery
 *   allows until released; if the recovery outlasted the whole hold, the release still counts
 *   as a tap, so the shot waits in the tap buffer.
 * - A drag of the tile's aim distance aims instead (the reticle shows the snapped line), stops
 *   any repeat, and fires along the aim on release.
 *
 * Pure: ticks and bearings in, the input and the shot to send out, on top of `fireHold`.
 */
import {
  aimedFire,
  fireStepAt,
  heldFire,
  IDLE_FIRE,
  releasedFire,
  tappedFire,
  type FireHold,
} from './fireHold'

export type TilePhase = 'idle' | 'pending' | 'held' | 'aiming'

export interface TilePress {
  phase: TilePhase
  pressedTick: number
  /** While aiming: the bearing the reticle draws and the release fires. */
  aimBearing: number | null
  /** Whether this press already sent a shot. */
  hasFired: boolean
}

export interface FireInput {
  press: TilePress
  hold: FireHold
}

export const UNTOUCHED_TILE: TilePress = {
  phase: 'idle',
  pressedTick: 0,
  aimBearing: null,
  hasFired: false,
}

export const IDLE_INPUT: FireInput = { press: UNTOUCHED_TILE, hold: IDLE_FIRE }

export interface TileFrame {
  input: FireInput
  /** The bearing to send `ground_gun.fire` along now, if a shot is due. */
  shotBearing: number | null
}

export function pressedTile(input: FireInput, tick: number): FireInput {
  return { ...input, press: { ...UNTOUCHED_TILE, phase: 'pending', pressedTick: tick } }
}

/** A drag far enough to aim: the press aims along `bearing` and stops any repeat. */
export function draggedTile(input: FireInput, bearing: number): FireInput {
  if (input.press.phase === 'idle') return input
  return {
    press: { ...input.press, phase: 'aiming', aimBearing: bearing },
    hold: releasedFire(aimedFire(input.hold, bearing)),
  }
}

/** One frame at `tick`: a long enough press becomes a held gun, then the hold decides. */
export function frameOfTile(
  input: FireInput,
  tick: number,
  nextShotTick: number,
  facingBearing: number,
  holdFireTicks: number,
): TileFrame {
  const held = withHoldStarted(input, tick, facingBearing, holdFireTicks)
  const step = fireStepAt(held.hold, tick, nextShotTick)
  const press = step.shotBearing === null ? held.press : { ...held.press, hasFired: true }
  return { input: { press, hold: step.hold }, shotBearing: step.shotBearing }
}

/** The finger lifts: a tap or an aim fires as a tap; a hold lets go. */
export function releasedTile(input: FireInput, tick: number, facingBearing: number): FireInput {
  return { press: UNTOUCHED_TILE, hold: holdOnRelease(input, tick, facingBearing) }
}

/** The press is lost (the finger slid off, the system took it): nothing more fires. */
export function cancelledTile(input: FireInput): FireInput {
  return { press: UNTOUCHED_TILE, hold: releasedFire(input.hold) }
}

function withHoldStarted(
  input: FireInput,
  tick: number,
  facingBearing: number,
  holdFireTicks: number,
): FireInput {
  const { press } = input
  if (press.phase !== 'pending' || tick - press.pressedTick < holdFireTicks) return input
  return { press: { ...press, phase: 'held' }, hold: heldFire(input.hold, facingBearing) }
}

function holdOnRelease(input: FireInput, tick: number, facingBearing: number): FireHold {
  const { press, hold } = input
  if (press.phase === 'aiming') return tappedFire(hold, press.aimBearing as number, tick)
  if (press.phase === 'pending') return tappedFire(hold, facingBearing, tick)
  const released = releasedFire(hold)
  return press.phase === 'held' && !press.hasFired
    ? tappedFire(released, facingBearing, tick)
    : released
}
