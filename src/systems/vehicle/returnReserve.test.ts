import { describe, expect, it } from 'vitest'
import { engineStats } from '../economy/vehicleStats'
import { returnReserveUnits } from './returnReserve'

describe('return reserve (#33 section 5)', () => {
  it('is 25 units at depth 100 with the level-0 engine', () => {
    expect(returnReserveUnits(100, engineStats(0).speedMax)).toBe(25)
  })

  it('is nothing at the surface', () => {
    expect(returnReserveUnits(0, engineStats(0).speedMax)).toBe(0)
  })

  it('rounds a part unit up', () => {
    expect(returnReserveUnits(1, engineStats(0).speedMax)).toBe(1)
  })

  it('shrinks as the engine gets faster', () => {
    expect(returnReserveUnits(300, engineStats(20).speedMax)).toBeLessThan(
      returnReserveUnits(300, engineStats(0).speedMax),
    )
  })
})
