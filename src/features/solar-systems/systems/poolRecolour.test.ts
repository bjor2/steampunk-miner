import { describe, expect, it } from 'vitest'
import { MATERIALS } from '../../materials'
import { systemMaterialPoolsOf, type MaterialPool } from './materialPool'
import { recolouredKindProblemsOf } from './poolRecolour'

// Fail-on-recolour for the generated pools (ticket 777; HS input on the Campaign Scaling lock): a
// later system's ore is never a first-system species with a new hue. The family-level check is
// newContentSlots.test.ts and familyBehaviours.test.ts.

const SEED = 20261024
const OTHER_SEED = 42
const SYSTEMS_2_TO_40 = Array.from({ length: 39 }, (_, at) => BigInt(at + 2))

/** System 2's first pool with each kind swapped for a first-system species, keeping its hue slot. */
function recolouredFirstSystemPool(pool: MaterialPool, sourcePool: string): MaterialPool {
  const species = MATERIALS.materials.filter((row) => row.pool === sourcePool)
  return {
    ...pool,
    kinds: pool.kinds.map((kind, at) => {
      const source = species[at % species.length]
      return { ...kind, silhouette: source.silhouette, pattern: source.pattern }
    }),
  }
}

describe('generated material pool recolour check', () => {
  it('draws no kind that wears a first-system look or word, systems 2 to 40 under two seeds', () => {
    for (const seed of [SEED, OTHER_SEED]) {
      const pools = SYSTEMS_2_TO_40.flatMap((system) => systemMaterialPoolsOf(seed, system))
      expect(recolouredKindProblemsOf(pools)).toEqual([])
    }
  })

  it("fails on a recolour of the first system: planet 6-7's species under new hue slots", () => {
    const [pool] = systemMaterialPoolsOf(SEED, 2n)
    const recoloured = recolouredFirstSystemPool(pool, 'foothold-p6-p7')
    expect(recoloured.kinds.map((kind) => kind.hueSlot)).toEqual(
      pool.kinds.map((kind) => kind.hueSlot),
    )
    const problems = recolouredKindProblemsOf([recoloured])
    expect(problems).toHaveLength(pool.kinds.length)
    expect(problems[0]).toMatch(
      /^system2-p1-c1 wears [a-z-]+\/[a-z-]+, a first-system species' look$/,
    )
  })

  it("fails on a first-system species' id, epithet or name under a new look", () => {
    const [pool] = systemMaterialPoolsOf(SEED, 2n)
    const [species] = MATERIALS.materials
    const renamed = {
      ...pool,
      kinds: [{ ...pool.kinds[0], epithet: species.epithet, name: species.name }],
    }
    expect(recolouredKindProblemsOf([renamed])).toEqual([
      `system2-p1-c1 carries "${species.epithet}", a first-system species' word`,
      `system2-p1-c1 carries "${species.name}", a first-system species' word`,
    ])
  })
})
