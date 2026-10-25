import { describe, expect, it } from 'vitest'
import { actOf } from '../../planet-mix'
import { firstSystemPoolOf, lookGroupOf, lookGroupPoolsOf } from './firstSystemPools'
import { planetMaterialPoolOf, type MaterialPool } from './materialPool'
import { materialPoolProblemsOf } from './materialPoolGuards'

// System 1's generated pools from P6 (ticket 888, the GD lock M1 of 25 Oct 2026): the #777
// generator over each act's run of planets, held to the same lock as a drawn system's pools.

const SEED = 20261024
const OTHER_SEED = 42
const P6_TO_P40 = Array.from({ length: 35 }, (_, at) => at + 6)

function lookKeysOf(pool: MaterialPool): string[] {
  return pool.kinds.map((kind) => `${kind.silhouette}/${kind.pattern}/${kind.hueSlot}`)
}

describe('first-system generated pools', () => {
  it('refuses P1 to P5, which keep their authored pools', () => {
    for (const place of [1, 2, 3, 4, 5]) {
      expect(() => firstSystemPoolOf(SEED, place)).toThrow(RangeError)
    }
  })

  it("walks each act's run of planets from P6 as one look group", () => {
    expect(lookGroupOf(6)).toEqual([6, 7])
    expect(lookGroupOf(7)).toEqual([6, 7])
    expect(lookGroupOf(8)).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16])
    expect(lookGroupOf(40)).toEqual([33, 34, 35, 36, 37, 38, 39, 40])
    expect(lookGroupOf(41)).toEqual([41])
    for (const place of lookGroupOf(20)) expect(actOf(place).id).toBe(actOf(20).id)
  })

  it('holds every #777 guard on P6 to P40 under two seeds', () => {
    for (const seed of [SEED, OTHER_SEED]) {
      const groups = new Set(P6_TO_P40.map((place) => lookGroupOf(place).join(',')))
      for (const group of groups) {
        const places = group.split(',').map(Number)
        expect(materialPoolProblemsOf(lookGroupPoolsOf(seed, places))).toEqual([])
      }
    }
  })

  it('ids each kind by its address, system1-p<p>-<slot>, never by a name', () => {
    const pool = firstSystemPoolOf(SEED, 6)
    expect(pool.id).toBe('system1-p6')
    expect(pool.kinds.map((kind) => kind.id)).toEqual(
      pool.kinds.map((kind) => `system1-p6-${kind.slot}`),
    )
    expect(new Set(pool.kinds.map((kind) => kind.id)).size).toBe(pool.kinds.length)
  })

  it('draws the same pool on every read, another under another seed', () => {
    const once = JSON.stringify(firstSystemPoolOf(SEED, 20))
    expect(JSON.stringify(firstSystemPoolOf(SEED, 20))).toBe(once)
    expect(JSON.stringify(firstSystemPoolOf(OTHER_SEED, 20))).not.toBe(once)
  })

  it('gives P6 and P7 their own looks, so the two planets no longer look alike', () => {
    const [p6, p7] = lookGroupPoolsOf(SEED, [6, 7])
    const p6Looks = new Set(lookKeysOf(p6).map((key) => key.split('/').slice(0, 2).join('/')))
    for (const key of lookKeysOf(p7)) {
      expect(p6Looks.has(key.split('/').slice(0, 2).join('/'))).toBe(false)
    }
  })

  // Shared g by design (#781, GD lock on #888): SS1 P6 and SS2 p1 are both g = 6, and SS1 P11 and
  // SS3 p1 both g = 11. Value keys on g, everything else on the address.
  it('prices addresses that share a g alike, while their species, looks and ids differ', () => {
    for (const [place, system] of [
      [6, 2n],
      [11, 3n],
    ] as const) {
      const first = firstSystemPoolOf(SEED, place)
      const drawn = planetMaterialPoolOf(SEED, system, 1n)
      expect(first.campaignIndex).toBe(drawn.campaignIndex)
      const tiersOf = (pool: MaterialPool) =>
        pool.kinds.flatMap((kind) => (kind.gemSaleTier === null ? [] : [kind.gemSaleTier]))
      expect(tiersOf(first)).toEqual(tiersOf(drawn))
      expect(first.id).not.toBe(drawn.id)
      expect(lookKeysOf(first)).not.toEqual(lookKeysOf(drawn))
    }
  })
})
