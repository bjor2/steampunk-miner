import { describe, expect, it } from 'vitest'
import { fromCanonical } from '../money'
import { collapseCrushDamage, collapseCrushFraction } from './collapseCrush'
import { ECONOMY } from './economy'

describe('collapse crush', () => {
  it('takes 8% of the hull in every band and in the core', () => {
    const bands = [1, 2, 3, 4, 5, ECONOMY.ore.coreTierBand]
    expect(bands.map(collapseCrushFraction)).toEqual(new Array(6).fill(fromCanonical('0.08')))
  })

  it('scales the crush with the vehicle hull', () => {
    expect(collapseCrushDamage(2, fromCanonical('250'))).toEqual(fromCanonical('20'))
  })
})
