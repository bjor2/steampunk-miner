import { describe, expect, it } from 'vitest'
import { powerUpProblems } from '../../power-up-core'
import { DRILL_GEAR_ITEMS, drillGearItemOf, type DrillGearItem } from './drillGearItems'
import { powerUpOf } from './drillGearPowerUps'
import { sampleOreAhead } from './samplingCorer'

function powerUpOfId(itemId: string) {
  return powerUpOf(drillGearItemOf(itemId) as DrillGearItem)
}

describe('drill-gear power-ups', () => {
  it('keeps the power-up class rules for every item', () => {
    expect(DRILL_GEAR_ITEMS.flatMap((item) => powerUpProblems(powerUpOf(item)))).toEqual([])
  })

  it('makes the corer a charged item with the #162 4.2 numbers that acts by sampling', () => {
    expect(powerUpOfId('gear.sampling_corer')).toMatchObject({
      id: 'drill-gear.sampling_corer',
      powerUpClass: 'charged',
      charges: 4,
      cooldownTicks: 300,
      windupTicks: 6,
      isToggle: false,
      activate: sampleOreAhead,
    })
  })

  it('draws 0.3% of the tank a second for the auger and nothing for the other toggles', () => {
    expect(powerUpOfId('gear.spoil_auger')).toMatchObject({
      isToggle: true,
      energyDrawBpPerSecond: 30,
    })
    expect(powerUpOfId('gear.side_cutters')).toMatchObject({
      isToggle: true,
      energyDrawBpPerSecond: 0,
    })
    expect(powerUpOfId('gear.reach_boom')).toMatchObject({
      isToggle: true,
      energyDrawBpPerSecond: 0,
    })
  })

  it('makes every head a passive on while slotted, with no charges', () => {
    const heads = DRILL_GEAR_ITEMS.filter((item) => item.slot === 'drill.head').map(powerUpOf)
    for (const head of heads) {
      expect(head).toMatchObject({ powerUpClass: 'passive', isToggle: false, charges: 0 })
    }
  })
})
