import { describe, expect, it } from 'vitest'
import { fromCanonical } from '../../../systems/money'
import economyFile from '../extraction.economy.json'
import { EXTRACTION_ECONOMY, readExtractionEconomy } from './extractionEconomy'

describe('extraction economy', () => {
  it('reads the one-off price as 15 band-5 ore units (#162 4.1)', () => {
    expect(EXTRACTION_ECONOMY.price).toEqual({ band: 5, oreUnits: fromCanonical('15') })
  })

  it('reads the drain and siphon rows of #162 4.2', () => {
    expect(EXTRACTION_ECONOMY.balance).toEqual({
      'power.mineral_drain': {
        charges: 2,
        cooldownTicks: 900,
        actTicks: 60,
        reachTiles: 3,
        cellsPerUse: 6,
      },
      'power.slurry_siphon': {
        charges: 3,
        cooldownTicks: 600,
        actTicks: 6,
        reachTiles: 5,
        cellsPerUse: 6,
      },
    })
  })

  it('refuses the whole file and lists every broken field', () => {
    const broken: { items: Record<string, Record<string, unknown>> } = structuredClone(economyFile)
    broken.items.price = { band: 5, oreUnits: -15 }
    broken.items.balance = {
      'power.slurry_siphon': { ...economyFile.items.balance['power.slurry_siphon'], charges: '3' },
    }
    expect(readExtractionEconomy(broken)).toEqual({
      problems: [
        'items.price.oreUnits must be a decimal string >= 0',
        'items.balance.power.slurry_siphon.charges must be a safe integer',
      ],
    })
  })
})
