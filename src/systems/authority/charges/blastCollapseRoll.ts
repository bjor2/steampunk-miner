/**
 * A bare blast's collapse roll (D2 #861; the Horizontal Scaler on #861: "hash-based `collapseBp` is
 * fine"): every rim block the blast disturbs draws `hash(worldSeed, s, p, block, blastSeq)`, a
 * whole number of basis points from 0 to 9999, and collapses when the draw is under its size's
 * `collapseBp`. The planet seed is already the hash of the world seed and the star-map address
 * `(s, p)` (`planetAddressSeed.ts`); the blast's `blastSeq` is saved with the session, so a reload
 * draws the same rolls and never rerolls one.
 */
import { BASIS_POINTS } from '../../../constants/balance'
import { hashCell } from '../../cellRandom'
import type { CollapseBlock } from '../../world/collapseBlock'
import { SEED_PURPOSE, subSeedFor } from '../../world/generatorSeeds'
import type { PlanetParams } from '../../world/planetParams'

/** One more than the largest 32-bit hash: a hash over it is a share in [0, 1). */
const HASH_RANGE = 0x100000000
const WORD = 0x100000000

/** The block's draw for the blast numbered `blastSeq`, 0 to 9999 basis points. */
export function collapseRollOf(
  params: PlanetParams,
  block: CollapseBlock,
  blastSeq: number,
): number {
  const blastSeed = blastSeedOf(params, blastSeq)
  const hash = hashCell(hashCell(blastSeed, block.cx, block.cy), block.index, 0)
  return Math.floor((hash * BASIS_POINTS) / HASH_RANGE)
}

/** Whether a draw of `roll` collapses a block under a chance of `collapseBp`. */
export function isRolledToCollapse(roll: number, collapseBp: number): boolean {
  return roll < collapseBp
}

/** The blast's own seed: its number's low and high words mixed into the planet's roll seed. */
function blastSeedOf(params: PlanetParams, blastSeq: number): number {
  const lowWord = blastSeq % WORD
  return hashCell(
    subSeedFor(params, SEED_PURPOSE.blastCollapse),
    lowWord,
    (blastSeq - lowWord) / WORD,
  )
}
