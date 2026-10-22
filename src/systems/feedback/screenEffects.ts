/**
 * Screen shake and flash (#13 VFX): a hit shakes and flashes, a clank shakes a little. Both are
 * intensity-limited (`SHAKE_MAX_METRES`, `FLASH_MAX_OPACITY`) and both obey the player's switches
 * (#2 accessibility baseline, #33): with `shake` off nothing moves the camera, with `flashes`
 * off nothing covers the screen. They step on the render delta, presentation only, and decay
 * the same at any frame rate. Updated in place, because they run every frame.
 *
 * A hull hit (ticket 720) kicks its own shake, held to `HIT_SHAKE_PIXELS` on the screen for
 * `HIT_SHAKE_SECONDS`, softer for frontal drill contact; a side or rear hit flashes the red edge it
 * came from instead of the veil, and a hit from everywhere keeps the veil.
 */
import {
  DRILL_FACE_HIT_SHAKE_PIXELS,
  FLASH_MAX_OPACITY,
  FLASH_SECONDS,
  HIT_EDGE_FLASH_SECONDS,
  HIT_SHAKE_PIXELS,
  HIT_SHAKE_SECONDS,
  SHAKE_DECAY_SECONDS,
  SHAKE_MAX_METRES,
  SHAKE_WOBBLE_HZ,
} from '../../constants/scene'
import { accentOf } from './accents'
import type { FeedbackCue } from './feedbackCues'
import { HIT_EDGES, screenEdgeOf, type HitEdge, type HitFrom } from './hitFrom'

export interface ScreenEffects {
  /** 0 to 1; the offset grows with its square, so small kicks stay small. */
  shake: number
  /** Seconds of wobble so far, for the offset's direction. */
  wobbleSeconds: number
  /** 0 to `FLASH_MAX_OPACITY`. */
  flash: number
  /** The last hit's shake, screen pixels at its kick, fading to 0 over `HIT_SHAKE_SECONDS`. */
  hitShakePixels: number
  hitShakeSecondsLeft: number
  /** Each edge's red hit flash, 1 at the hit, fading to 0 over `HIT_EDGE_FLASH_SECONDS`. */
  edgeFlash: Record<HitEdge, number>
  /** The camera's offset this frame, metres. */
  offsetX: number
  offsetY: number
}

export interface EffectSwitches {
  shake: boolean
  flashes: boolean
}

interface ScreenKick {
  shake: number
  flash: number
}

/**
 * How hard each cue kicks the screen: shake 0 to 1, flash as a share of the cap. A charge's blast
 * carries its own kick (`chargeBlastCue`, #213), the shipped charge's by default.
 */
const KICKS: Readonly<Record<Exclude<FeedbackCue['kind'], 'chargeBlast'>, ScreenKick>> = {
  pickup: { shake: 0, flash: 0 },
  dockClank: { shake: 0.35, flash: 0 },
  upgradeClank: { shake: 0.3, flash: 0 },
  // A hit's shake is its own, held in screen pixels (`kickHitShake`, ticket 720).
  hit: { shake: 0, flash: 1 },
  destroyed: { shake: 1, flash: 1 },
  coreStinger: { shake: 0.4, flash: 0.6 },
  travelStinger: { shake: 0.5, flash: 0 },
  casingHiss: { shake: 0, flash: 0 },
  casingPop: { shake: 0, flash: 0 },
  collapseRumble: { shake: 0.15, flash: 0 },
  collapseCrash: { shake: 0.6, flash: 0 },
  // The wrecker gnaws more than 20 tiles away: heard, not felt.
  wreckerScrape: { shake: 0, flash: 0 },
  // Felt in the hand only (#173 haptics): the screen stays still while the drill cuts.
  drillContact: { shake: 0, flash: 0 },
  // A slot's hold ending is heard at the thumb (ticket 253); the screen stays still.
  holdCancelled: { shake: 0, flash: 0 },
  holdFinished: { shake: 0, flash: 0 },
  // The bore's clank at the far end of its line is heard, not felt (#309).
  boreClank: { shake: 0, flash: 0 },
  autoValveClick: { shake: 0, flash: 0 },
  // The flourish on the ground is the reveal's whole look (#698); the screen stays still.
  speciesReveal: { shake: 0, flash: 0 },
}

export function createScreenEffects(): ScreenEffects {
  return {
    shake: 0,
    wobbleSeconds: 0,
    flash: 0,
    hitShakePixels: 0,
    hitShakeSecondsLeft: 0,
    edgeFlash: { top: 0, right: 0, bottom: 0, left: 0 },
    offsetX: 0,
    offsetY: 0,
  }
}

function kickOf(cue: FeedbackCue): ScreenKick {
  return cue.kind === 'chargeBlast' ? cue.kick : KICKS[cue.kind]
}

/**
 * The flash is the bloom-flash accent (#48): only a cue whose one accent it is may flash, and a
 * charge's blast, whose flash its cue provider sizes (#213, TD on #145).
 */
function mayFlash(cue: FeedbackCue): boolean {
  return accentOf(cue) === 'bloomFlash' || cue.kind === 'chargeBlast'
}

/**
 * A cue's kick, only through the switches the player left on. A hit's edge turns with how the
 * camera shows local up (`cameraPresence.localUpScreenAngle`; 0 once the rotating camera settles).
 */
export function kickScreen(
  effects: ScreenEffects,
  cue: FeedbackCue,
  switches: EffectSwitches,
  localUpScreenAngle = 0,
): void {
  kickShake(effects, kickOf(cue), switches)
  kickFlash(effects, cue, switches)
  if (cue.kind === 'hit') kickHit(effects, cue.from, switches, localUpScreenAngle)
}

function kickShake(effects: ScreenEffects, kick: ScreenKick, switches: EffectSwitches): void {
  if (switches.shake) effects.shake = Math.min(1, effects.shake + kick.shake)
}

function kickFlash(effects: ScreenEffects, cue: FeedbackCue, switches: EffectSwitches): void {
  if (switches.flashes && mayFlash(cue)) {
    effects.flash = Math.max(effects.flash, kickOf(cue).flash * FLASH_MAX_OPACITY)
  }
}

function kickHit(
  effects: ScreenEffects,
  from: HitFrom,
  switches: EffectSwitches,
  localUpScreenAngle: number,
): void {
  if (switches.shake) kickHitShake(effects, hitShakePixelsOf(from))
  if (switches.flashes && from.kind === 'bearing') {
    effects.edgeFlash[screenEdgeOf(from.radians, localUpScreenAngle)] = 1
  }
}

function hitShakePixelsOf(from: HitFrom): number {
  return from.kind === 'drillFace' ? DRILL_FACE_HIT_SHAKE_PIXELS : HIT_SHAKE_PIXELS
}

/** Hits never stack past the cap: a new hit restarts the clock at the harder of the two shakes. */
function kickHitShake(effects: ScreenEffects, pixels: number): void {
  effects.hitShakePixels = Math.max(hitShakeReachPixels(effects), pixels)
  effects.hitShakeSecondsLeft = HIT_SHAKE_SECONDS
}

/**
 * One frame: decay every effect, and write the camera's offset; a switch turned off clears its
 * effect. `metresPerPixel` turns the hit's pixel shake into world metres at this frame's zoom.
 */
export function stepScreenEffects(
  effects: ScreenEffects,
  dt: number,
  switches: EffectSwitches,
  metresPerPixel: number,
): void {
  decayShake(effects, dt, switches.shake)
  decayFlashes(effects, dt, switches.flashes)
  writeShakeOffset(effects, metresPerPixel)
}

function decayShake(effects: ScreenEffects, dt: number, isOn: boolean): void {
  effects.shake = isOn ? effects.shake * Math.exp(-dt / SHAKE_DECAY_SECONDS) : 0
  effects.hitShakeSecondsLeft = isOn ? Math.max(0, effects.hitShakeSecondsLeft - dt) : 0
  effects.wobbleSeconds = isShaking(effects) ? effects.wobbleSeconds + dt : 0
}

function isShaking(effects: ScreenEffects): boolean {
  return effects.shake > 0 || effects.hitShakeSecondsLeft > 0
}

function decayFlashes(effects: ScreenEffects, dt: number, isOn: boolean): void {
  effects.flash = isOn ? Math.max(0, effects.flash - (FLASH_MAX_OPACITY * dt) / FLASH_SECONDS) : 0
  for (const edge of HIT_EDGES) {
    effects.edgeFlash[edge] = isOn
      ? Math.max(0, effects.edgeFlash[edge] - dt / HIT_EDGE_FLASH_SECONDS)
      : 0
  }
}

/** The hit's shake this frame, in screen pixels: linear down to 0 at `HIT_SHAKE_SECONDS`. */
export function hitShakeReachPixels(effects: ScreenEffects): number {
  return (effects.hitShakePixels * effects.hitShakeSecondsLeft) / HIT_SHAKE_SECONDS
}

/**
 * Two incommensurate wobbles, so the shake never settles into a line. The hit's shake turns on a
 * circle of its reach, so its offset never passes the pixel cap.
 */
function writeShakeOffset(effects: ScreenEffects, metresPerPixel: number): void {
  const reach = SHAKE_MAX_METRES * effects.shake * effects.shake
  const hitReach = hitShakeReachPixels(effects) * metresPerPixel
  const turn = 2 * Math.PI * SHAKE_WOBBLE_HZ * effects.wobbleSeconds
  effects.offsetX = reach * Math.sin(turn) + hitReach * Math.sin(turn)
  effects.offsetY = reach * Math.cos(turn * 1.31) + hitReach * Math.cos(turn)
}
