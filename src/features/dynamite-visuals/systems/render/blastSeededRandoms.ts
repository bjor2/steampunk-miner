/**
 * Each live blast's own seeded random (D8, ticket 868, the TD's seam): a `BlastStarted` takes a slot
 * for its tile with `hash(planetSeed, blastSeq)`, and every piece the blast throws afterwards,
 * fronts included, draws from that slot, so the same blast looks the same on a replay, a reload
 * or a guest. The slots are few and reused round-robin; a front whose blast has no slot any more
 * (a fifth live blast, or a preview with no record) draws from the fixed fallback.
 */
import { createSeededRandom, type SeededRandom } from '../../../../systems/seededRandom'

interface BlastRandomSlot {
  tx: number
  ty: number
  isTaken: boolean
  random: SeededRandom
}

export interface BlastRandoms {
  slots: BlastRandomSlot[]
  next: number
  fallback: SeededRandom
}

export function createBlastRandoms(slotCount: number, fallbackSeed: number): BlastRandoms {
  return {
    slots: Array.from({ length: slotCount }, () => ({
      tx: 0,
      ty: 0,
      isTaken: false,
      random: createSeededRandom(0),
    })),
    next: 0,
    fallback: createSeededRandom(fallbackSeed),
  }
}

/** Gives the blast at `tx, ty` a slot seeded with `seed`, taking the oldest; returns its random. */
export function seedBlastRandom(
  randoms: BlastRandoms,
  tx: number,
  ty: number,
  seed: number,
): SeededRandom {
  const slot = randoms.slots[randoms.next]
  randoms.next = (randoms.next + 1) % randoms.slots.length
  slot.tx = tx
  slot.ty = ty
  slot.isTaken = true
  slot.random = createSeededRandom(seed)
  return slot.random
}

/** The random of the blast at `tx, ty`, or the fallback when none holds that tile. */
export function randomOfBlastAt(randoms: BlastRandoms, tx: number, ty: number): SeededRandom {
  for (const slot of randoms.slots) {
    if (slot.isTaken && slot.tx === tx && slot.ty === ty) return slot.random
  }
  return randoms.fallback
}
