import { describe, expect, it } from 'vitest'
import { fromCanonical } from '../../../systems/money'
import economyFile from '../drill-gear.economy.json'
import { DRILL_GEAR_ECONOMY, readDrillGearEconomy } from './drillGearEconomy'

type EditableFile = { items: Record<string, Record<string, unknown>> }

function fileWithRow(itemId: string, row: Record<string, unknown>): EditableFile {
  const file: EditableFile = structuredClone(economyFile)
  file.items.balance = { ...file.items.balance, [itemId]: row }
  return file
}

describe('drill-gear economy', () => {
  it('reads the one-off price as 15 band-5 ore units (#162 4.1)', () => {
    expect(DRILL_GEAR_ECONOMY.price).toEqual({ band: 5, oreUnits: fromCanonical('15') })
  })

  it('has a balance row for each of the eight drill-gear items', () => {
    expect(Object.keys(DRILL_GEAR_ECONOMY.balance)).toEqual([
      'gear.vibratory_bit',
      'gear.spoil_auger',
      'gear.side_cutters',
      'gear.thaw_crown',
      'gear.twin_bit',
      'gear.sampling_corer',
      'gear.dielectric_bit',
      'gear.reach_boom',
    ])
  })

  it('reads the corer of #162 4.2 and the auger draw of 4.4 in whole units', () => {
    expect(DRILL_GEAR_ECONOMY.balance['gear.sampling_corer']).toEqual({
      charges: 4,
      cooldownTicks: 300,
      windUpTicks: 6,
      reachTiles: 6,
    })
    expect(DRILL_GEAR_ECONOMY.balance['gear.spoil_auger']?.drawBpPerSecond).toBe(30)
  })

  it('carries the Vertical caps: a side cell costs at least the main cell, the reach is one cell', () => {
    expect(DRILL_GEAR_ECONOMY.drillPathCaps).toEqual({
      sideEnergyShareBpMin: 10000,
      aheadCellsMax: 1,
    })
    expect(DRILL_GEAR_ECONOMY.balance['gear.side_cutters']?.sideEnergyShareBp).toBe(10000)
    expect(DRILL_GEAR_ECONOMY.balance['gear.reach_boom']?.aheadCells).toBe(1)
  })

  it('refuses side cells cheaper than the main drill and a reach past one cell', () => {
    const cheapSides = fileWithRow('gear.side_cutters', { sideCells: 1, sideEnergyShareBp: 5000 })
    const longReach = fileWithRow('gear.reach_boom', { aheadCells: 2, drawBpPerSecond: 0 })
    expect(readDrillGearEconomy(cheapSides)).toEqual({
      problems: ['items.balance.gear.side_cutters.sideEnergyShareBp must be >= 10000'],
    })
    expect(readDrillGearEconomy(longReach)).toEqual({
      problems: ['items.balance.gear.reach_boom.aheadCells must be <= 1'],
    })
  })

  it('refuses the whole file and lists every broken field', () => {
    const broken = fileWithRow('gear.sampling_corer', { charges: '4', bladeCount: 2 })
    broken.items.price = { band: 5, oreUnits: -15 }
    expect(readDrillGearEconomy(broken)).toEqual({
      problems: [
        'items.price.oreUnits must be a decimal string >= 0',
        'items.balance.gear.sampling_corer.charges must be a safe integer',
        'items.balance.gear.sampling_corer.bladeCount is not a drill-gear stat',
      ],
    })
  })
})
