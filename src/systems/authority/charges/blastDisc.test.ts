import { describe, expect, it } from 'vitest'
import { chargeRadiusMm, chargeSizeCount } from '../../economy/chargeSizes'
import { freshPlanetParamsFor } from '../../world/planetParams'
import {
  baseR2Of,
  baseTilesSqOf,
  groundR2Of,
  groundR2OnPlanetOf,
  groundRadiusMmOf,
  groundTilesSqOf,
  halfTileRadiusOf,
  isHalfTileRadius,
} from './blastDisc'

const SIZES = Array.from({ length: chargeSizeCount() }, (_, at) => at + 1)
const PLANET_1 = freshPlanetParamsFor(83921, 1)
const LEVELS = [0, 10, 1_000_000]

function discOf(size: number, radiusLevel: number) {
  return { radiusMm: chargeRadiusMm(size), radiusLevel }
}

describe('blast disc', () => {
  it('holds each rung as whole half-tiles, 2 L_i, from 5 at size 1 to 74 at size 12', () => {
    expect(SIZES.map((size) => halfTileRadiusOf(chargeRadiusMm(size)))).toEqual([
      5, 7, 9, 12, 16, 20, 26, 32, 40, 48, 60, 74,
    ])
  })

  it('squares the base radius as (2 L_i)² · 16, 400 at size 1 and 87,616 at size 12', () => {
    expect(baseR2Of(discOf(1, 0))).toBe(400n)
    expect(baseR2Of(discOf(12, 0))).toBe(87_616n)
  })

  it('grows the ground r² as (2 L_i)² · (16 + L) and never the base one, at L = 0, 10 and 1e6', () => {
    for (const size of SIZES) {
      const half = BigInt(halfTileRadiusOf(chargeRadiusMm(size)))
      for (const level of LEVELS) {
        expect(baseR2Of(discOf(size, level))).toBe(baseR2Of(discOf(size, 0)))
        expect(groundR2Of(discOf(size, level))).toBe(half * half * (16n + BigInt(level)))
      }
    }
  })

  it('keeps every digit of a ground r² past 2^53', () => {
    const level = Number.MAX_SAFE_INTEGER
    expect(String(groundR2Of(discOf(12, level)))).toBe('49323423118961754332')
  })

  it('clears exactly the rung radius at L = 0: the shipped disc, tile for tile and mm for mm', () => {
    for (const size of SIZES) {
      const disc = discOf(size, 0)
      expect(groundTilesSqOf(disc, PLANET_1)).toBe(baseTilesSqOf(chargeRadiusMm(size)))
      expect(groundRadiusMmOf(disc, PLANET_1)).toBe(chargeRadiusMm(size))
    }
  })

  it('widens the ground by √(1 + L/16): size 1 at L = 10 reaches 3.187 m and 10 tiles²', () => {
    expect(groundRadiusMmOf(discOf(1, 10), PLANET_1)).toBe(3187)
    expect(groundTilesSqOf(discOf(1, 10), PLANET_1)).toBe(10)
  })

  it('meets the planet at its diameter at L = 1e6, where every size reaches as far', () => {
    const diameter = 2 * PLANET_1.radiusTiles
    for (const size of SIZES) {
      const disc = discOf(size, 1_000_000)
      expect(groundTilesSqOf(disc, PLANET_1)).toBe(diameter * diameter)
      expect(groundRadiusMmOf(disc, PLANET_1)).toBe(diameter * 1000)
      expect(groundR2OnPlanetOf(disc, PLANET_1) < groundR2Of(disc)).toBe(true)
    }
  })

  it('refuses a radius that is not whole half-tiles', () => {
    expect(isHalfTileRadius(2500)).toBe(true)
    expect(isHalfTileRadius(2499)).toBe(false)
    expect(isHalfTileRadius('2500')).toBe(false)
    expect(() => halfTileRadiusOf(1250)).toThrow(RangeError)
  })
})
