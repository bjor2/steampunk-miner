import { describe, expect, it } from 'vitest'
import { gemSaleTiersOfPlanet } from '../../../systems/registries/planetRow'
import { materialNameOf } from '../../materials'
import { oreFamilies } from '../../ores'
import { materialPoolProblemsOf } from './materialPoolGuards'
import {
  planetMaterialPoolOf,
  poolMixOf,
  systemMaterialPoolsOf,
  type MaterialPool,
  type PoolKind,
} from './materialPool'
import { materialPoolRuleProblems, MATERIAL_POOL_RULES } from './materialPoolRules'
import { systemRosterOf } from './systemRoster'

// A solar system's generated material pools (ticket 777, spec #774): one generator from the
// campaign index to a pool, held to the Campaign Scaling lock by the pool guards.

const SEED = 20261024
const OTHER_SEED = 42
const SYSTEMS_2_TO_40 = Array.from({ length: 39 }, (_, at) => BigInt(at + 2))
const KINDS_ABOUT = 15
const KINDS_CAP = 17
const GEM_SHARE_CAP_BP = 1500

function liveIn(pool: MaterialPool, band: number): PoolKind[] {
  return pool.kinds.filter((kind) => kind.window[0] <= band && band <= kind.window[1])
}

function gemsOf(pool: MaterialPool): PoolKind[] {
  return pool.kinds.filter((kind) => kind.gemSaleTier !== null)
}

function planetIndexOf(pool: MaterialPool): number {
  return Number(pool.campaignIndex)
}

function withKinds(pool: MaterialPool, kinds: readonly PoolKind[]): MaterialPool[] {
  return [{ ...pool, kinds }]
}

function withKind(pool: MaterialPool, at: number, change: Partial<PoolKind>): MaterialPool[] {
  return withKinds(
    pool,
    pool.kinds.map((kind, index) => (index === at ? { ...kind, ...change } : kind)),
  )
}

describe('generated material pool', () => {
  it('draws the same pools on every read, others under another seed, and refuses system 1', () => {
    const once = JSON.stringify(systemMaterialPoolsOf(SEED, 2n))
    expect(JSON.stringify(systemMaterialPoolsOf(SEED, 2n))).toBe(once)
    expect(JSON.stringify(systemMaterialPoolsOf(OTHER_SEED, 2n))).not.toBe(once)
    expect(() => systemMaterialPoolsOf(SEED, 1n)).toThrow(RangeError)
    expect(() => planetMaterialPoolOf(SEED, 2n, 6n)).toThrow(RangeError)
    expect(planetMaterialPoolOf(SEED, 2n, 3n)).toEqual(systemMaterialPoolsOf(SEED, 2n)[2])
  })

  it('holds about 15 kinds on every planet, never past the 17-kind cap', () => {
    expect(MATERIAL_POOL_RULES).toEqual({
      kindsTarget: KINDS_ABOUT,
      kindsCap: KINDS_CAP,
      gemCount: 3,
    })
    for (const seed of [SEED, OTHER_SEED]) {
      for (const system of [...SYSTEMS_2_TO_40, 1_000_000n]) {
        for (const pool of systemMaterialPoolsOf(seed, system)) {
          expect(pool.kinds.length).toBeGreaterThanOrEqual(KINDS_ABOUT)
          expect(pool.kinds.length).toBeLessThanOrEqual(KINDS_CAP)
        }
      }
    }
  })

  it("cuts every kind from a run the planet's own ore mix paints, its window the bands painted", () => {
    const roster = systemRosterOf(SEED, 2n)
    systemMaterialPoolsOf(SEED, 2n).forEach((pool, at) => {
      const mix = poolMixOf(SEED, 2n, roster[at])
      for (const kind of pool.kinds) {
        const painted = mix.bands.flatMap((entries, band) =>
          entries.some(
            (entry) => !entry.signature && entry.family === kind.family && entry.lead === kind.lead,
          )
            ? [band + 1]
            : [],
        )
        expect([painted[0], painted.at(-1)]).toEqual(kind.window)
      }
    })
  })

  it('is scarce near the surface: band 1 holds the fewest kinds, commons and an uncommon only', () => {
    for (const pool of systemMaterialPoolsOf(SEED, 2n)) {
      const surface = liveIn(pool, 1)
      expect(new Set(surface.map((kind) => kind.rarity))).toEqual(new Set(['common', 'uncommon']))
      for (const band of [2, 3, 4, 5]) {
        expect(liveIn(pool, band).length).toBeGreaterThanOrEqual(surface.length)
      }
    }
  })

  it('keeps an uncommon ore within the first trip, and rares only from band 3 (d >= 0.35)', () => {
    for (const pool of SYSTEMS_2_TO_40.flatMap((system) => systemMaterialPoolsOf(SEED, system))) {
      expect(liveIn(pool, 1).some((kind) => kind.rarity === 'uncommon')).toBe(true)
      const rares = pool.kinds.filter((kind) => kind.lead >= 2)
      expect(rares.every((kind) => kind.window[0] >= 3)).toBe(true)
    }
  })

  it("sells its three rarest kinds as gems in bands 3 to 5, in 1-3 cell clusters, at the planet's gem tiers", () => {
    for (const pool of systemMaterialPoolsOf(SEED, 2n)) {
      const gems = gemsOf(pool)
      expect(gems.map((gem) => gem.gemSaleTier)).toEqual(gemSaleTiersOfPlanet(planetIndexOf(pool)))
      const rarest = Math.min(...gems.map((gem) => gem.lead))
      expect(pool.kinds.filter((kind) => kind.gemSaleTier === null && kind.lead > rarest)).toEqual(
        [],
      )
      for (const gem of gems) {
        expect(gem.window[0]).toBeGreaterThanOrEqual(3)
        expect(gem.clusterCells).toEqual([1, 3])
      }
    }
  })

  it('keeps the gems under 15% of the pool value on paper', () => {
    for (const seed of [SEED, OTHER_SEED]) {
      for (const pool of SYSTEMS_2_TO_40.flatMap((system) => systemMaterialPoolsOf(seed, system))) {
        expect(pool.gemValueShareBp).toBeGreaterThan(0)
        expect(pool.gemValueShareBp).toBeLessThanOrEqual(GEM_SHARE_CAP_BP)
      }
    }
  })

  it('gives every planet of system 2 its new family, an ore family carried by the band-1 uncommon', () => {
    const pools = systemMaterialPoolsOf(SEED, 2n)
    expect(pools.map((pool) => pool.newFamily?.id)).toEqual(
      systemRosterOf(SEED, 2n).map((planet) => planet.slot?.id),
    )
    for (const pool of pools) {
      const carriers = pool.kinds.filter((kind) => kind.newFamily !== null)
      if (pool.newFamily?.kind !== 'ore_family') {
        expect(carriers).toEqual([])
        continue
      }
      expect(carriers.map((kind) => [kind.newFamily, kind.rarity, kind.window[0]])).toEqual([
        [pool.newFamily.id, 'uncommon', 1],
      ])
    }
  })

  it('names each kind by its address and its look, under the family name, in four words at most', () => {
    const [pool] = systemMaterialPoolsOf(SEED, 2n)
    expect(pool.id).toBe('system2-p1')
    for (const kind of pool.kinds) {
      expect(kind.id).toBe(`system2-p1-${kind.slot}`)
      expect(kind.slot).toMatch(/^[cuerm][1-9]$/)
      const family = oreFamilies().find((row) => row.id === kind.family)
      expect(kind.name).toBe(materialNameOf(kind.epithet, family?.name ?? ''))
      expect(kind.epithet.toLowerCase()).toBe(`${kind.pattern} ${kind.silhouette}`)
      expect(kind.name.split(' ').length).toBeLessThanOrEqual(4)
    }
    expect(planetMaterialPoolOf(SEED, 1_000_000n, 5n).id).toBe('system1000000-p5')
  })

  it('holds the lock on systems 2 to 40 under two seeds and on system 1e6', () => {
    for (const seed of [SEED, OTHER_SEED]) {
      for (const system of SYSTEMS_2_TO_40) {
        expect(materialPoolProblemsOf(systemMaterialPoolsOf(seed, system))).toEqual([])
      }
    }
    expect(materialPoolProblemsOf(systemMaterialPoolsOf(SEED, 1_000_000n))).toEqual([])
  })
})

describe('generated material pool guards', () => {
  const pools = systemMaterialPoolsOf(SEED, 2n)
  const [first] = pools
  const spall = pools.find((pool) => pool.newFamily?.id === 'spall_glass') as MaterialPool
  const surfaceUncommon = first.kinds.findIndex((kind) => kind.slot === 'u1')
  const gem = first.kinds.findIndex((kind) => kind.gemSaleTier !== null)

  it('refuses a planet with too few kinds', () => {
    expect(materialPoolProblemsOf(withKinds(first, first.kinds.slice(1)))).toContain(
      'system2-p1 holds 14 kinds, not 15 to 17',
    )
  })

  it('refuses a rare kind in band 1, and a band 1 with no uncommon', () => {
    expect(materialPoolProblemsOf(withKind(first, surfaceUncommon, { lead: 2 }))).toEqual(
      expect.arrayContaining([
        'system2-p1 holds a rare kind in band 1',
        "system2-p1 holds no uncommon kind within the first trip's reach (band 1)",
      ]),
    )
  })

  it('refuses a rare kind above band 3, and a band 1 fuller than a deeper band', () => {
    const rare = first.kinds.findIndex((kind) => kind.lead === 2)
    expect(materialPoolProblemsOf(withKind(first, rare, { window: [2, 5] }))).toContain(
      `${first.kinds[rare].id} is rare above band 3 (d < 0.35)`,
    )
    const narrowed = first.kinds.map((kind) =>
      kind.window[0] === 1 ? kind : { ...kind, window: [5, 5] as const },
    )
    expect(materialPoolProblemsOf(withKinds(first, narrowed))).toContain(
      'system2-p1 holds more kinds in band 1 than deeper',
    )
  })

  it('refuses a missing gem, a gem in band 2 or out of clusters, and gems over the value cap', () => {
    expect(materialPoolProblemsOf(withKind(first, gem, { gemSaleTier: null }))).toContain(
      'system2-p1 sells 2 gems, not 3',
    )
    expect(
      materialPoolProblemsOf(withKind(first, gem, { window: [2, 5], clusterCells: null })),
    ).toEqual(
      expect.arrayContaining([
        `gem ${first.kinds[gem].id} lives outside bands 3 to 5`,
        `gem ${first.kinds[gem].id} does not grow in clusters of 1 to 3 cells`,
      ]),
    )
    expect(materialPoolProblemsOf([{ ...first, gemValueShareBp: 1501 }])).toEqual([
      "system2-p1's gems are 1501 bp of its value, over the cap",
    ])
  })

  it('refuses a system 2 planet with no new family, and an ore family no kind carries', () => {
    expect(materialPoolProblemsOf([{ ...first, newFamily: null }])).toEqual([
      'system2-p1 has no new enemy, hazard or ore family',
    ])
    const uncarried = spall.kinds.map((kind) => ({ ...kind, newFamily: null }))
    expect(materialPoolProblemsOf(withKinds(spall, uncarried))).toEqual([
      `${spall.id}'s new ore family spall_glass is carried by no kind`,
    ])
  })

  it('refuses two kinds of a planet with one look, and two planets of a system with one pair', () => {
    const twin = { silhouette: first.kinds[0].silhouette, hueSlot: first.kinds[0].hueSlot }
    expect(materialPoolProblemsOf(withKind(first, 1, twin))).toEqual(
      expect.arrayContaining([
        `system2-p1 holds two kinds with silhouette ${twin.silhouette}`,
        `system2-p1 holds two kinds with hueSlot ${twin.hueSlot}`,
      ]),
    )
    const [, second] = pools
    const borrowed = { silhouette: first.kinds[0].silhouette, pattern: first.kinds[0].pattern }
    const twinPlanet = withKind(second, 0, borrowed)[0]
    expect(materialPoolProblemsOf([first, twinPlanet])).toContain(
      `two kinds of the system wear ${borrowed.silhouette}/${borrowed.pattern}`,
    )
  })
})

describe('material pool rules', () => {
  it('refuses a target that is no whole number and one past the roster cap', () => {
    expect(materialPoolRuleProblems({ kindsTarget: 0 }, KINDS_CAP)).toEqual([
      'materialPool.kindsTarget must be a whole number from 1',
    ])
    expect(materialPoolRuleProblems({ kindsTarget: 18 }, KINDS_CAP)).toEqual([
      'materialPool.kindsTarget 18 is over the 17-kind roster cap',
    ])
    expect(materialPoolRuleProblems({ kindsTarget: KINDS_ABOUT }, KINDS_CAP)).toEqual([])
  })
})
