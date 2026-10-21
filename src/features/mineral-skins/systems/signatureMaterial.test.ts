import { describe, expect, it } from 'vitest'
import { ORE_LOOKS, oreFamilyLookOf } from '../../ore-visuals'
import { ORE_ROWS, oreTierOf } from '../../ores'
import { signatureMaterialsByPlanet } from './signatureMaterial'

// The signature materials a skin row may dress (ticket 603 under #576): from P3 the act's signature
// family paints its own cells at the band-5 tier (#141), the slotless 16th material of #453 E1, on
// every planet a species pool covers.

const SIGNATURES = signatureMaterialsByPlanet()

describe('signature materials of the pooled planets', () => {
  it('lists the relic signature of planets 3 to 7 and none on the legacy planets', () => {
    expect([...SIGNATURES.keys()]).toEqual([3, 4, 5, 6, 7])
    expect([...SIGNATURES.values()].every((material) => material.family === 'relic')).toBe(true)
  })

  it("names planet 4's signature ore at its band-5 tier, on the planet's own pool", () => {
    expect(SIGNATURES.get(4)).toMatchObject({
      pool: ORE_ROWS.kinds.poolByPlanet.get(4),
      oreTypeId: `relic_t${oreTierOf(4, 5, 0)}`,
    })
  })

  it("carries the hue and luma bands of the family's look", () => {
    const relic = oreFamilyLookOf(ORE_LOOKS, 'relic')
    expect(SIGNATURES.get(4)).toMatchObject({ hueBand: relic?.hueBand, lumaBand: relic?.lumaBand })
  })

  it('lists exactly the planets the pool map names, each with its act signature', () => {
    expect(signatureMaterialsByPlanet(new Map([[9, 'foothold-p4']])).get(9)?.family).toBe(
      'radioactive',
    )
    expect(signatureMaterialsByPlanet(new Map()).size).toBe(0)
  })
})
