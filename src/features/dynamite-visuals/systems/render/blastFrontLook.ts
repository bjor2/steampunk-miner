/**
 * The look of a blast's front (#153 Game Director looks 2 and 3): a ring of fire and dust riding
 * the edge of the clearing, and debris thrown outward from that front, never from the centre.
 * Everything keys on the rim, so a bigger blast is a longer ring, not a denser one, and every
 * count stays inside its pool (#154: the kernel spark and collapse-dust pools, plus the slice's
 * one instanced debris pool). The ring and debris follow K6's `BlastFront` tick by tick in the
 * wiring (#215); this is the look at a given radius.
 */
import { MM_PER_METRE } from '../../../../constants/physics'
import { COLLAPSE_DUST_CAPACITY, SPARK_CAPACITY } from '../../../../constants/scene'
import {
  BLAST_DEBRIS_CAPACITY,
  DEBRIS_PER_RIM_TILE,
  DUST_PER_RIM_TILE,
  FIRE_PER_RIM_TILE,
  FLASH_FRAMES,
  FLASH_SPRITE_MAX_OPACITY,
  RING_WIDTH_MAX_M,
  RING_WIDTH_MIN_M,
  RING_WIDTH_SHARE,
} from './blastLookConstants'
import { blastCueOf } from './blastCue'

export interface BlastRing {
  /** The clearing's edge, metres from the blast tile's centre. */
  radiusM: number
  /** How thick the fire-and-dust band is, metres. */
  widthM: number
}

export interface BlastFlash {
  /** Frames the flash sprite shows (#153: two). */
  frames: number
  /** The flash sprite's reach, metres: it covers the clearing. */
  radiusM: number
}

/** What one `BlastFront` slice throws: the rim it uncovered, so a whole blast throws its look. */
export interface FrontSpray {
  fire: number
  dust: number
  debris: number
}

/** The flash sprite on the detonation tick: the clearing's reach, at the size's flash share. */
export interface FlashSprite extends BlastFlash {
  opacity: number
}

export interface BlastFrontLook {
  ring: BlastRing
  /** Sparks of fire on the ring, from the kernel spark pool. */
  fireCount: number
  /** Dust motes on the ring, from the kernel collapse-dust pool. */
  dustCount: number
  /** Debris pieces thrown from the ring, from the slice's instanced pool. */
  debrisCount: number
  flash: BlastFlash
}

export function blastFrontLookOf(radiusMm: number): BlastFrontLook {
  return {
    ring: blastRingOf(radiusMm),
    fireCount: fireCountOf(radiusMm),
    dustCount: dustCountOf(radiusMm),
    debrisCount: debrisCountOf(radiusMm),
    flash: { frames: FLASH_FRAMES, radiusM: radiusMm / MM_PER_METRE },
  }
}

/**
 * The counts a slice from `rInnerMm` to `rOuterMm` adds: the rim's look at its outer edge less the
 * look at its inner edge. A blast's slices follow on, so together they throw the full rim's
 * counts and never more, each inside its pool (#154).
 */
export function frontSprayOf(rInnerMm: number, rOuterMm: number): FrontSpray {
  return {
    fire: Math.max(0, fireCountOf(rOuterMm) - fireCountOf(rInnerMm)),
    dust: Math.max(0, dustCountOf(rOuterMm) - dustCountOf(rInnerMm)),
    debris: Math.max(0, debrisCountOf(rOuterMm) - debrisCountOf(rInnerMm)),
  }
}

/** The size's flash, the same share the cue flashes the screen with at the blast (#153 look 1). */
export function flashSpriteOf(size: number, radiusMm: number): FlashSprite {
  return {
    frames: FLASH_FRAMES,
    radiusM: radiusMm / MM_PER_METRE,
    opacity: blastCueOf(size, radiusMm, 0).flash * FLASH_SPRITE_MAX_OPACITY,
  }
}

export function blastRingOf(radiusMm: number): BlastRing {
  const radiusM = radiusMm / MM_PER_METRE
  const widthM = Math.min(RING_WIDTH_MAX_M, Math.max(RING_WIDTH_MIN_M, radiusM * RING_WIDTH_SHARE))
  return { radiusM, widthM }
}

/** The rim's length in tiles, what every count grows with. */
export function rimTilesOf(radiusMm: number): number {
  return (2 * Math.PI * radiusMm) / MM_PER_METRE
}

export function fireCountOf(radiusMm: number): number {
  return countOnRim(radiusMm, FIRE_PER_RIM_TILE, SPARK_CAPACITY)
}

export function dustCountOf(radiusMm: number): number {
  return countOnRim(radiusMm, DUST_PER_RIM_TILE, COLLAPSE_DUST_CAPACITY)
}

export function debrisCountOf(radiusMm: number): number {
  return countOnRim(radiusMm, DEBRIS_PER_RIM_TILE, BLAST_DEBRIS_CAPACITY)
}

function countOnRim(radiusMm: number, perTile: number, capacity: number): number {
  return Math.min(capacity, Math.round(rimTilesOf(radiusMm) * perTile))
}

/** What the front layer draws in a frame: a pool draws one call while it holds any piece. */
export interface LayerDraw {
  drawCalls: number
  instances: number
}

/** The pieces the front's pools hold this frame, and whether the flash sprite shows. */
export interface FrontPoolCounts {
  fire: number
  dust: number
  debris: number
  isFlashShown: boolean
}

export function frontLayerDrawOf(counts: FrontPoolCounts): LayerDraw {
  const flash = counts.isFlashShown ? 1 : 0
  const pools = [counts.fire, counts.dust, counts.debris]
  return {
    drawCalls: pools.filter((count) => count > 0).length + flash,
    instances: counts.fire + counts.dust + counts.debris + flash,
  }
}

/** Raises `peak` to `now` where `now` is higher; returns `peak`. */
export function raisePeak(peak: LayerDraw, now: LayerDraw): LayerDraw {
  peak.drawCalls = Math.max(peak.drawCalls, now.drawCalls)
  peak.instances = Math.max(peak.instances, now.instances)
  return peak
}
