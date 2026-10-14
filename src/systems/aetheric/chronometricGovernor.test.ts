import { describe, expect, expectTypeOf, it } from 'vitest'
import { slowedEnemyStep } from './slowPocket'

describe('chronometric governor', () => {
  it('halves an enemy step inside the pocket', () => {
    expect(slowedEnemyStep(120, true)).toBe(60)
  })

  it('rounds a slowed odd step down to whole millimetres', () => {
    expect(slowedEnemyStep(121, true)).toBe(60)
  })

  it('leaves an enemy step outside the pocket unchanged', () => {
    expect(slowedEnemyStep(121, false)).toBe(121)
  })

  it('takes only the enemy step and the pocket test, never the vehicle motion', () => {
    expectTypeOf(slowedEnemyStep).parameters.toEqualTypeOf<[number, boolean]>()
    expect(slowedEnemyStep).toHaveLength(2)
  })
})
