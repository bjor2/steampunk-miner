import { describe, expect, it } from 'vitest'
import { fromCanonical } from '../../../systems/money'
import economyFile from '../terrain-tools.economy.json'
import { readTerrainEconomy, TERRAIN_ECONOMY } from './terrainEconomy'

describe('terrain economy', () => {
  it('reads the one-off price as 15 and the per-unit price as 2 band-5 ore units (#162 4.1)', () => {
    expect(TERRAIN_ECONOMY.oneOffPrice).toEqual({ band: 5, oreUnits: fromCanonical('15') })
    expect(TERRAIN_ECONOMY.perUnitPrice).toEqual({ band: 5, oreUnits: fromCanonical('2') })
  })

  it('reads the charged rows of #162 4.2 with their wind-up and terrain cap', () => {
    expect(TERRAIN_ECONOMY.balance['power.ore_shifter']).toEqual({
      charges: 2,
      cooldownTicks: 600,
      windupTicks: 6,
      reachTiles: 6,
      magnitude: 8,
      magnitudeLimit: 64,
    })
    expect(TERRAIN_ECONOMY.balance['power.pressure_pocket']).toEqual({
      charges: 2,
      cooldownTicks: 480,
      windupTicks: 6,
      magnitude: 2,
    })
  })

  it('reads a consumable row of #162 4.3 as a stack with no cooldown', () => {
    expect(TERRAIN_ECONOMY.balance['consumable.lodestone_beacon']).toEqual({
      charges: 1,
      magnitude: 10,
      swapCap: 256,
    })
  })

  it('refuses the whole file and lists every broken field', () => {
    const broken: { items: Record<string, Record<string, unknown>> } = structuredClone(economyFile)
    broken.items.price = { ...economyFile.items.price, perUnit: { band: 5, oreUnits: -2 } }
    broken.items.balance = {
      'power.strata_press': { ...economyFile.items.balance['power.strata_press'], charges: '3' },
      'consumable.shoring_props': { charges: 2, magnitude: 8, reachTiles: 1.5 },
    }
    expect(readTerrainEconomy(broken)).toEqual({
      problems: [
        'items.price.perUnit.oreUnits must be a decimal string >= 0',
        'items.balance.power.strata_press.charges must be a safe integer',
        'items.balance.consumable.shoring_props.reachTiles must be a safe integer',
      ],
    })
  })
})
