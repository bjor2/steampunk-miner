/**
 * The seed of one blast's explosion look (D8, ticket 868; the TD's seam: "all randomness is seeded
 * from hash(worldSeed, blastSeq)"): the planet's seed, itself `hash(worldSeed, s, p)`, mixed with
 * the slice's own purpose word and the blast's saved number, so a replay, a reload and a guest
 * throw every spark the same way, and the look never reads a clock or `Math.random`. Look-only: the
 * seed feeds the layer's pools and nothing else, so NDJSON and state are the same with VFX on or off.
 */
import { hashCell } from '../../../../systems/cellRandom'

/** The slice's own purpose word, apart from the kernel's `SEED_PURPOSE` table. */
const VFX_PURPOSE = 0xd8
const WORD = 0x100000000

export function blastVfxSeedOf(planetSeed: number, blastSeq: number): number {
  const lowWord = blastSeq % WORD
  return hashCell(hashCell(planetSeed, VFX_PURPOSE, 0), lowWord, (blastSeq - lowWord) / WORD)
}
