/**
 * A generation hook's own seed (docs/standards/feature-slices.md 5.2): it depends only on the
 * planet and the hook's id, never on which other hooks exist, so adding a slice never moves another
 * slice's output. Renaming a hook id is a generator change.
 */
import { hashCell } from '../cellRandom'
import { SEED_PURPOSE } from '../world/generatorSeeds'
import type { PlanetParams } from '../world/planetParams'

const FNV_OFFSET_BASIS = 0x811c9dc5
const FNV_PRIME = 0x01000193

const UTF8 = new TextEncoder()
/** Hooks run per patch and per ore cell; the id's hash is the same every time. */
const HASH_BY_HOOK_ID = new Map<string, number>()

export function subSeedForHook(params: PlanetParams, hookId: string): number {
  return hashCell(params.planetSeed, SEED_PURPOSE.sliceHook, hookIdHash(hookId))
}

/** FNV-1a 32 over the id's UTF-8 bytes, in `hashCell`'s integer style (`Math.imul`, `>>> 0`). */
export function hookIdHash(hookId: string): number {
  const known = HASH_BY_HOOK_ID.get(hookId)
  if (known !== undefined) return known
  const hash = fnv1a32(UTF8.encode(hookId))
  HASH_BY_HOOK_ID.set(hookId, hash)
  return hash
}

function fnv1a32(bytes: Uint8Array): number {
  let hash = FNV_OFFSET_BASIS
  for (const byte of bytes) hash = Math.imul(hash ^ byte, FNV_PRIME) >>> 0
  return hash
}
