/**
 * The planet seed of a star-map address (ticket 754): seeds come from hashing `(s, p)` (the TD
 * architecture in the GD lock on #650), never from the campaign index, which two addresses may
 * share. System 1 hashes with the world seed itself, so its planet `p` keeps today's
 * `planetSeedFor(worldSeed, p)` (#4) and every generator sub-seed of P1 onward with it; a later
 * system first hashes its own seed from the world seed and its index.
 */
import { hashCell } from '../cellRandom'
import { assertValidAddress, FIRST_SYSTEM } from './planetAddress'

/** Sets a later system's seed apart from a planet seed drawn from the same world seed. */
const SYSTEM_SEED_SALT = 0x5ec7

const WORD_MASK = 0xffffffffn

export function planetSeedAt(worldSeed: number, system: bigint, planet: bigint): number {
  assertValidAddress(system, planet)
  return hashIndexInto(systemSeedOf(worldSeed, system), planet)
}

function systemSeedOf(worldSeed: number, system: bigint): number {
  if (system === FIRST_SYSTEM) return worldSeed
  return hashIndexInto(hashCell(worldSeed, SYSTEM_SEED_SALT, 0), system)
}

/**
 * `planetSeedFor`'s mix (#4): the index's low and high 32 bits; past 64 bits each further 64 are
 * folded into the hash, so any index has its own seed and a safe-integer one keeps today's.
 */
function hashIndexInto(seed: number, index: bigint): number {
  let hash = hashCell(seed, wordOf(index), wordOf(index >> 32n))
  for (let rest = index >> 64n; rest > 0n; rest >>= 64n) {
    hash = hashCell(hash, wordOf(rest), wordOf(rest >> 32n))
  }
  return hash
}

function wordOf(index: bigint): number {
  return Number(index & WORD_MASK)
}
