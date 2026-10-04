import { describe, expect, it } from 'vitest'
import { cellRandomFloat, hashCell } from './cellRandom'

describe('cell random', () => {
  it('gives the same value for the same seed and cell', () => {
    expect(hashCell(83921, 10, -4)).toBe(hashCell(83921, 10, -4))
  })

  it('does not depend on which cells were asked for first', () => {
    const direct = cellRandomFloat(5, 100, 200)
    cellRandomFloat(5, 1, 1)
    cellRandomFloat(5, 2, 2)
    expect(cellRandomFloat(5, 100, 200)).toBe(direct)
  })

  it('tells neighbouring cells apart', () => {
    const values = new Set([
      hashCell(9, 0, 0),
      hashCell(9, 1, 0),
      hashCell(9, 0, 1),
      hashCell(9, -1, 0),
      hashCell(9, 0, -1),
    ])
    expect(values.size).toBe(5)
  })

  it('tells (x, y) from (y, x)', () => {
    expect(hashCell(9, 3, 8)).not.toBe(hashCell(9, 8, 3))
  })

  it('changes the whole world with the seed', () => {
    expect(hashCell(1, 4, 4)).not.toBe(hashCell(2, 4, 4))
  })

  it('keeps floats in [0, 1) and roughly evenly spread', () => {
    let belowHalf = 0
    const cells = 4000
    for (let i = 0; i < cells; i++) {
      const value = cellRandomFloat(42, i, -i)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
      if (value < 0.5) belowHalf++
    }
    expect(belowHalf / cells).toBeGreaterThan(0.45)
    expect(belowHalf / cells).toBeLessThan(0.55)
  })
})
