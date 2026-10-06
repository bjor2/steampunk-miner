/**
 * Screen shake and flash (#13 VFX): a hit shakes and flashes, a clank shakes a little. Both are
 * intensity-limited (`SHAKE_MAX_METRES`, `FLASH_MAX_OPACITY`) and both obey the player's switches
 * (#2 accessibility baseline, #33): with `shake` off nothing moves the camera, with `flashes`
 * off nothing covers the screen. They step on the render delta, presentation only, and decay
 * the same at any frame rate. Updated in place, because they run every frame.
 */
import {
  FLASH_MAX_OPACITY,
  FLASH_SECONDS,
  SHAKE_DECAY_SECONDS,
  SHAKE_MAX_METRES,
  SHAKE_WOBBLE_HZ,
} from '../../constants/scene'
import { accentOf } from './accents'
import type { FeedbackCue } from './feedbackCues'

export interface ScreenEffects {
  /** 0 to 1; the offset grows with its square, so small kicks stay small. */
  shake: number
  /** Seconds of wobble so far, for the offset's direction. */
  wobbleSeconds: number
  /** 0 to `FLASH_MAX_OPACITY`. */
  flash: number
  /** The camera's offset this frame, metres. */
  offsetX: number
  offsetY: number
}

export interface EffectSwitches {
  shake: boolean
  flashes: boolean
}

/** How hard each cue kicks the screen: shake 0 to 1, flash as a share of the cap. */
const KICKS: Readonly<Record<FeedbackCue['kind'], { shake: number; flash: number }>> = {
  pickup: { shake: 0, flash: 0 },
  dockClank: { shake: 0.35, flash: 0 },
  upgradeClank: { shake: 0.3, flash: 0 },
  hit: { shake: 0.7, flash: 1 },
  destroyed: { shake: 1, flash: 1 },
  coreStinger: { shake: 0.4, flash: 0.6 },
  travelStinger: { shake: 0.5, flash: 0 },
  casingHiss: { shake: 0, flash: 0 },
  casingPop: { shake: 0, flash: 0 },
  collapseRumble: { shake: 0.15, flash: 0 },
  collapseCrash: { shake: 0.6, flash: 0 },
  // The wrecker gnaws more than 20 tiles away: heard, not felt.
  wreckerScrape: { shake: 0, flash: 0 },
  chargeBlast: { shake: 0.8, flash: 0 },
}

export function createScreenEffects(): ScreenEffects {
  return { shake: 0, wobbleSeconds: 0, flash: 0, offsetX: 0, offsetY: 0 }
}

/** The flash is the bloom-flash accent (#48): only a cue whose one accent it is may flash. */
function isFlashAccent(cue: FeedbackCue): boolean {
  return accentOf(cue) === 'bloomFlash'
}

/** A cue's kick, only through the switches the player left on. */
export function kickScreen(
  effects: ScreenEffects,
  cue: FeedbackCue,
  switches: EffectSwitches,
): void {
  const kick = KICKS[cue.kind]
  if (switches.shake) effects.shake = Math.min(1, effects.shake + kick.shake)
  if (switches.flashes && isFlashAccent(cue)) {
    effects.flash = Math.max(effects.flash, kick.flash * FLASH_MAX_OPACITY)
  }
}

/** One frame: decay both, and write the camera's offset; a switch turned off clears its effect. */
export function stepScreenEffects(
  effects: ScreenEffects,
  dt: number,
  switches: EffectSwitches,
): void {
  decayShake(effects, dt, switches.shake)
  effects.flash = switches.flashes
    ? Math.max(0, effects.flash - (FLASH_MAX_OPACITY * dt) / FLASH_SECONDS)
    : 0
  writeShakeOffset(effects)
}

function decayShake(effects: ScreenEffects, dt: number, isOn: boolean): void {
  effects.shake = isOn ? effects.shake * Math.exp(-dt / SHAKE_DECAY_SECONDS) : 0
  effects.wobbleSeconds = effects.shake > 0 ? effects.wobbleSeconds + dt : 0
}

/** Two incommensurate wobbles, so the shake never settles into a line. */
function writeShakeOffset(effects: ScreenEffects): void {
  const reach = SHAKE_MAX_METRES * effects.shake * effects.shake
  const turn = 2 * Math.PI * SHAKE_WOBBLE_HZ * effects.wobbleSeconds
  effects.offsetX = reach * Math.sin(turn)
  effects.offsetY = reach * Math.cos(turn * 1.31)
}
