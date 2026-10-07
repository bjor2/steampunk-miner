import { describe, expect, it } from 'vitest'
import economyFile from '../ores.economy.json'
import familiesFile from '../oreFamilies.json'
import { oreRowProblems } from './oreRows'

describe('ore catalogue data', () => {
  it('accepts the shipped files', () => {
    expect(oreRowProblems(economyFile, familiesFile)).toEqual([])
  })

  it('refuses broken rows and lists every problem', () => {
    const economy = {
      ore: {
        leadWeightsBpByBand: { plus1: [9000, 600, 700, 800, 900], plus2: [2000, 0, 100, 200, 300] },
        signatureValueLead: -1,
        signatureShareCapBpByBand: { '3': 600 },
        catalogue: { variantsPerFamily: 0, echoEvery: 25, echoFrom: 126 },
      },
    }
    const families = {
      families: [
        { id: 'metal', name: 'Brassvein' },
        { id: 'metal', name: '' },
      ],
    }
    expect(oreRowProblems(economy, families)).toEqual([
      'families[1].name must name the family',
      'family "metal" is listed twice',
      "band 1's lead weights add up to more than 10000",
      'ore.signatureValueLead must be whole, from 0',
      'ore.signatureShareCapBpByBand must give bands 4 and 5 a cap in basis points',
      'ore.catalogue.variantsPerFamily must be a whole number from 1',
    ])
  })

  it('refuses more families than the cell family field holds', () => {
    const families = {
      families: Array.from({ length: 16 }, (_, at) => ({ id: `f${'x'.repeat(at)}`, name: 'F' })),
    }
    expect(oreRowProblems(economyFile, families)).toContain('at most 15 families fit a cell')
  })
})
