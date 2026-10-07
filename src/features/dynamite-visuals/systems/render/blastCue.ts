/**
 * The detonation-tick cue of a dynamite blast (#153 Game Director look 1 and "Outside the
 * radius"; the TD lock on #145): a two-frame flash and a camera shake, both full inside the blast
 * and falling off to nothing at 1.5 × the radius, and a thump that arrives later the further
 * away the listener stands. Size 1 at distance 0 is today's `chargeBlast` kick (shake 0.8, no
 * flash, no delay), so the shipped charge feels as it does now. Every number is a share: the
 * kernel (#213) clamps shake and flash to 0..1 and the delay to a second, and applies them only
 * through the player's shake and flash switches. The provider that feeds it is the wiring's (#215).
 */
import {
  CUE_REACH_RADII,
  FLASH_PER_SIZE_STEP,
  SHAKE_AT_SIZE_1,
  SHAKE_PER_SIZE_STEP,
  THUMP_DELAY_MAX_TICKS,
  THUMP_MM_PER_TICK,
} from './blastLookConstants'

export interface BlastCue {
  /** 0 to 1, the screen shake on the detonation tick. */
  shake: number
  /** 0 to 1, the share of the flash cap for the two-frame flash. */
  flash: number
  /** Ticks the thump waits before it sounds. */
  thumpDelayTicks: number
}

/** The cue for a listener `distanceMm` from a size `size` blast of radius `radiusMm`. */
export function blastCueOf(size: number, radiusMm: number, distanceMm: number): BlastCue {
  const share = cueShareAtDistance(radiusMm, distanceMm)
  return {
    shake: shakeAtCentreOf(size) * share,
    flash: flashAtCentreOf(size) * share,
    thumpDelayTicks: thumpDelayTicksOf(distanceMm),
  }
}

/** Full inside the radius, then straight down to nothing at `CUE_REACH_RADII` × the radius. */
export function cueShareAtDistance(radiusMm: number, distanceMm: number): number {
  if (distanceMm <= radiusMm) return 1
  const fadeMm = radiusMm * (CUE_REACH_RADII - 1)
  return Math.max(0, 1 - (distanceMm - radiusMm) / fadeMm)
}

/** A tile a tick, never more than the kernel's one-second cap. */
export function thumpDelayTicksOf(distanceMm: number): number {
  const ticks = Math.floor(Math.max(0, distanceMm) / THUMP_MM_PER_TICK)
  return Math.min(THUMP_DELAY_MAX_TICKS, ticks)
}

function shakeAtCentreOf(size: number): number {
  return Math.min(1, SHAKE_AT_SIZE_1 + (size - 1) * SHAKE_PER_SIZE_STEP)
}

function flashAtCentreOf(size: number): number {
  return Math.min(1, Math.max(0, (size - 1) * FLASH_PER_SIZE_STEP))
}
