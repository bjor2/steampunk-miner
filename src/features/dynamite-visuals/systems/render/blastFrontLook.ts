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
  RING_WIDTH_MAX_M,
  RING_WIDTH_MIN_M,
  RING_WIDTH_SHARE,
} from './blastLookConstants'

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
