import { describe, expect, it } from 'vitest'
import { fromCanonical, toCanonical } from '../../../systems/money'
import { cardLinesOf } from './cardLines'
import { drillGearItemOf, itemPriceOf, type DrillGearItem } from './drillGearItems'

const readingsOf = (itemId: string, mark: number) =>
  cardLinesOf(itemId, mark).map((line) => [line.label, toCanonical(line.value)])

const priceOf = (itemId: string) =>
  toCanonical(itemPriceOf(drillGearItemOf(itemId) as DrillGearItem)!)

describe('drill-gear card lines', () => {
  it('reads the corer in seconds and tiles, its price last', () => {
    expect(readingsOf('gear.sampling_corer', 1)).toEqual([
      ['Charges', '4e+0'],
      ['Cooldown (s)', '5e+0'],
      ['Wind-up (s)', toCanonical(fromCanonical('0.1'))],
      ['Reach (tiles)', '6e+0'],
      ['Price', priceOf('gear.sampling_corer')],
    ])
  })

  it('reads the auger draw as a percent of the tank a second', () => {
    expect(readingsOf('gear.spoil_auger', 1)[0]).toEqual([
      'Energy draw (% of tank a second)',
      toCanonical(fromCanonical('0.3')),
    ])
  })

  it('marks only the lines the Mark rotation steps', () => {
    const stepped = cardLinesOf('gear.sampling_corer', 1).filter((line) => line.isMarkStepped)
    expect(stepped.map((line) => line.label)).toEqual(['Charges', 'Cooldown (s)', 'Reach (tiles)'])
  })

  it('gives the thaw crown, with no numbers yet, its price as its one line', () => {
    expect(readingsOf('gear.thaw_crown', 1)).toEqual([['Price', priceOf('gear.thaw_crown')]])
  })

  it('gives the twin-bit head its one diagonal cell and its price (ticket 280)', () => {
    expect(readingsOf('gear.twin_bit', 1)).toEqual([
      ['Diagonal cut (cells)', '1e+0'],
      ['Price', priceOf('gear.twin_bit')],
    ])
  })

  it('gives the dielectric bit, a shield with nothing to count, its price as its one line', () => {
    expect(readingsOf('gear.dielectric_bit', 1)).toEqual([
      ['Price', priceOf('gear.dielectric_bit')],
    ])
  })

  it('has no lines for an item of another lane', () => {
    expect(cardLinesOf('power.echo_sounder', 1)).toEqual([])
  })
})
