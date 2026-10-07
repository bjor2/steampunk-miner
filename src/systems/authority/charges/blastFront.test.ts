import { describe, expect, it } from 'vitest'
import { blastFrontOf, frontRadiusMm, inRadiusCount, ticksToClear } from './blastFront'

const MM_PER_TILE = 1000

/** Every tile offset within `radiusTiles` of the charge tile's centre, counted the plain way. */
function plainCount(radiusTiles: number): number {
  let count = 0
  for (let dy = -radiusTiles; dy <= radiusTiles; dy++) {
    for (let dx = -radiusTiles; dx <= radiusTiles; dx++) {
      if (dx * dx + dy * dy <= radiusTiles * radiusTiles) count++
    }
  }
  return count
}

describe('blast front', () => {
  it('counts 1,793 tiles in a 24-tile radius and 21 in the shipped 2.5-tile one', () => {
    expect(inRadiusCount(24 * MM_PER_TILE)).toBe(1793)
    expect(inRadiusCount(2500)).toBe(21)
  })

  it('holds every tile within the radius once, as the plain count does, for radii 4 to 24', () => {
    for (let radius = 4; radius <= 24; radius++) {
      const front = blastFrontOf(radius * MM_PER_TILE)
      const keys = new Set(front.map(({ dx, dy }) => `${dx},${dy}`))
      expect(front).toHaveLength(plainCount(radius))
      expect(keys.size).toBe(front.length)
    }
  })

  it('takes the nearest tiles first, ties in row order', () => {
    const front = blastFrontOf(24 * MM_PER_TILE)
    expect(front[0]).toEqual({ dx: 0, dy: 0, distanceSq: 0 })
    expect(front.slice(1, 5).map(({ dx, dy }) => [dx, dy])).toEqual([
      [0, -1],
      [-1, 0],
      [1, 0],
      [0, 1],
    ])
    const isNearestFirst = front.every(
      (tile, at) => at === 0 || front[at - 1].distanceSq <= tile.distanceSq,
    )
    expect(isNearestFirst).toBe(true)
  })

  it('clears an R24 blast in 29 ticks of 64 tiles', () => {
    expect(ticksToClear(24 * MM_PER_TILE)).toBe(29)
    for (let radius = 4; radius <= 24; radius++) {
      expect(ticksToClear(radius * MM_PER_TILE)).toBe(Math.ceil(plainCount(radius) / 64))
    }
  })

  it('measures the front from the charge tile centre in whole millimetres', () => {
    expect(frontRadiusMm(0)).toBe(0)
    expect(frontRadiusMm(1)).toBe(1000)
    expect(frontRadiusMm(2)).toBe(1414)
    expect(frontRadiusMm(576)).toBe(24000)
  })
})
