/**
 * How the ceiling anchor shows (ticket 288; GD ruling Q3 and Q4 on #288): while an up-cut is
 * latched the bit tilts to the upward 45 degrees toward its side, and it eases back to level over
 * about 4 ticks once the up-cut ends. The anchor drop is the step `isClinging` goes false while the
 * step before was mid up-cut (an up-diagonal latch whose cell still stood): the light clank plays
 * on that step, once, and never per cell. Stepped once per fixed step from the authority replica;
 * presentation only, written in place.
 */
import type { UpCutSide } from '../ceilingAnchor'

/** About 4 ticks from full tilt back to level (GD Q4). */
export const TILT_EASE_TICKS = 4

/** The upward 45 degrees (GD Q3). */
const FULL_TILT_RADIANS = Math.PI / 4

/** What one fixed step reads of the local player's anchor and up-cut. */
export interface AnchorReading {
  tick: number
  isClinging: boolean
  /** The latched up-cut's side while one is allowed; null when none is. */
  upCutSide: UpCutSide | null
  /** The up-cut's latched cell still stands. */
  isUpCutCellStanding: boolean
}

export interface AnchorTilt {
  tick: number
  /** -1 full tilt to the left, 1 to the right, 0 level. */
  tilt: number
  wasMidUpCut: boolean
}

export function createAnchorTilt(): AnchorTilt {
  return { tick: -1, tilt: 0, wasMidUpCut: false }
}

export function createAnchorReading(): AnchorReading {
  return { tick: 0, isClinging: false, upCutSide: null, isUpCutCellStanding: false }
}

/** Steps the tilt one fixed step; true on the step the anchor lets go mid up-cut. */
export function stepAnchorTilt(look: AnchorTilt, reading: AnchorReading): boolean {
  if (reading.tick <= look.tick) levelAnchorTilt(look)
  const hasDropped = look.wasMidUpCut && !reading.isClinging
  look.tilt = easedTiltOf(look.tilt, targetTiltOf(reading))
  look.wasMidUpCut = isMidUpCut(reading)
  look.tick = reading.tick
  return hasDropped
}

/** The angle the tilt adds to the drill head's parts: right is clockwise, a negative angle. */
export function tiltAngleOf(look: AnchorTilt): number {
  return -look.tilt * FULL_TILT_RADIANS
}

/** A replay or a new session starts level, with no drop pending. */
function levelAnchorTilt(look: AnchorTilt): void {
  look.tilt = 0
  look.wasMidUpCut = false
}

function targetTiltOf(reading: AnchorReading): number {
  if (reading.upCutSide === null) return 0
  return reading.upCutSide === 'right' ? 1 : -1
}

function easedTiltOf(tilt: number, target: number): number {
  const step = 1 / TILT_EASE_TICKS
  if (Math.abs(target - tilt) <= step) return target
  return tilt + Math.sign(target - tilt) * step
}

function isMidUpCut(reading: AnchorReading): boolean {
  return reading.isClinging && reading.upCutSide !== null && reading.isUpCutCellStanding
}
