import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import { oreSalePrice } from '../../../systems/economy/oreEconomy'
import { oreTypeOf } from '../../../systems/registries/oreTypes'
import type { ResourceFamily } from '../../../systems/world/worldCell'
import { oreFamilies, oreTypeProvider } from '../../ores'
import { entrySalePriceOf } from './mixValue'
import { oreMixFor } from './oreMix'
import { isSignatureOre, planetMixSignatureTag } from './signatureTag'

const SEEDS = [83921, 31415, 27182]
const PLANETS = Array.from({ length: 200 }, (_, at) => at + 1)

const taggedSlices: readonly SliceDefinition[] = [
  { id: 'ores', register: (r) => r.oreTypes(oreTypeProvider) },
  { id: 'planet-mix', register: (r) => r.oreSignature(planetMixSignatureTag) },
]

function cellCodeOf(family: string): ResourceFamily {
  return oreFamilies().find((row) => row.id === family)?.cellCode as ResourceFamily
}

describe('planet mix signature tag', () => {
  it('claims every signature entry of the mix and no other entry, P1 to P200', () => {
    for (const planet of PLANETS) {
      for (const seed of SEEDS) {
        for (const entry of oreMixFor(planet, seed).bands.flat()) {
          expect(isSignatureOre(entry.family, entry.tier)).toBe(entry.signature)
        }
      }
    }
  })

  it('names one signature ore per planet from P3 at its band-5 tier, and none on P1 and P2', () => {
    const signaturesAt = (tier: number) =>
      oreFamilies()
        .filter((family) => isSignatureOre(family.id, tier))
        .map((family) => family.id)
    const bandFiveTier = (planet: number) => 3 * (planet - 1) + 5
    expect([1, 2].map((planet) => signaturesAt(bandFiveTier(planet)))).toEqual([[], []])
    expect([3, 9, 41, 45].map((planet) => signaturesAt(bandFiveTier(planet)))).toEqual([
      ['relic'],
      ['radioactive'],
      ['radioactive'],
      ['relic'],
    ])
    const otherTiers = Array.from({ length: 620 }, (_, at) => at + 1).filter(
      (tier) => (tier - 5) % 3 !== 0,
    )
    expect(otherTiers.flatMap(signaturesAt)).toEqual([])
  })

  it('makes the catalogue ore a signature that sells one tier up, with its id and tier kept', () => {
    withRegistrations(taggedSlices, () => {
      const relic = oreTypeOf({ tier: 11, cellFamily: cellCodeOf('relic') })
      const metal = oreTypeOf({ tier: 11, cellFamily: cellCodeOf('metal') })
      expect(relic).toMatchObject({ id: 'relic_t11', tier: 11, signature: true, saleTier: 12 })
      expect(metal.signature).not.toBe(true)
      expect(metal.saleTier).toBeUndefined()
    })
  })

  it("prices a signature entry at the kernel's sale tier, one above its own", () => {
    const signature = oreMixFor(12, 83921)
      .bands[4].filter((entry) => entry.signature)
      .at(0)
    expect(signature).toBeDefined()
    if (signature === undefined) return
    expect(entrySalePriceOf(signature)).toEqual(oreSalePrice(signature.tier + 1))
  })
})
