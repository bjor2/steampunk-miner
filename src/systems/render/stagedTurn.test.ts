import { describe, expect, it } from 'vitest'
import { turnedWidthShareOf } from './stagedTurn'

describe('staged turn', () => {
  it('draws the car at its full width as driven and mirrored when turned half round', () => {
    expect(turnedWidthShareOf(0)).toBe(1)
    expect(turnedWidthShareOf(Math.PI)).toBe(-1)
  })

  it('narrows the car as the projection of the turn, a quarter turn the narrowest', () => {
    expect(turnedWidthShareOf(Math.PI / 3)).toBeCloseTo(0.5, 12)
    expect(turnedWidthShareOf(Math.PI / 2)).toBe(0.01)
    expect(turnedWidthShareOf(Math.PI / 2 + 1e-9)).toBe(-0.01)
  })
})
