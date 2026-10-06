import { describe, expect, it } from 'vitest'
import { hashCell } from '../cellRandom'
import { SEED_PURPOSE } from '../world/generatorSeeds'
import { planetParamsFor } from '../world/planetParams'
import { hookIdHash, subSeedForHook } from './hookSeed'

describe('hook seed', () => {
  it('hashes a hook id with FNV-1a 32 over its UTF-8 bytes', () => {
    expect(hookIdHash('')).toBe(0x811c9dc5)
    expect(hookIdHash('a')).toBe(0xe40c292c)
    expect(hookIdHash('foobar')).toBe(0xbf9cf968)
  })

  it('hashes the UTF-8 bytes of a non-ASCII id, not its UTF-16 code units', () => {
    // 'é' is the bytes C3 A9 in UTF-8; hashing its one UTF-16 code unit E9 would give 0x6c0b6c44.
    expect(hookIdHash('é')).toBe(0x1e9de8c1)
  })

  it('mixes the planet seed, the slice-hook purpose and the id hash', () => {
    const params = planetParamsFor(83921, 1)
    expect(subSeedForHook(params, 'ores.lead')).toBe(
      hashCell(params.planetSeed, SEED_PURPOSE.sliceHook, hookIdHash('ores.lead')),
    )
  })

  it('gives two hooks on one planet different seeds and one hook different seeds per planet', () => {
    const first = planetParamsFor(83921, 1)
    const second = planetParamsFor(83921, 2)
    expect(subSeedForHook(first, 'ores.lead')).not.toBe(subSeedForHook(first, 'planet-mix.role'))
    expect(subSeedForHook(first, 'ores.lead')).not.toBe(subSeedForHook(second, 'ores.lead'))
  })
})
