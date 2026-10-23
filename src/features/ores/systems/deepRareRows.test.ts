import { describe, expect, it } from 'vitest'
import { toCanonical } from '../../../systems/money'
import { rarityMultiplierOf, rarityWeightBpOf } from './rarityTiers'

// Bjor's deep-rares rule (GD lock on #737, 22 Oct; ticket 738): from ore rules 11 a planet from P3
// draws rare, epic and mythic only from band 3 (d >= 0.35), at 0.25, 0.5 and 1 times their band-5
// weight in bands 3, 4 and 5 (mythic, live from band 4, at 0.5 and 1). Each tier's band-5 weight
// keeps its value over a planet's ore what it was on the mixed rows: its money moves out of band 2
// into bands 3 to 5 and is not added (Systems' guard on ticket 738).

const BANDS = [1, 2, 3, 4, 5]
const RARE = 2
const EPIC = 3
const MYTHIC = 4
const DEEP_TIERS = [RARE, EPIC, MYTHIC]
/** Bands 3, 4 and 5 at 0.25, 0.5 and 1 of band 5 (GD lock), as fractions of four. */
const QUARTERS_OF_BAND_FIVE = [0, 0, 1, 2, 4]
/**
 * Seed 83921's fresh P5 under ore rules 10, ore units per band (generated whole, ticket 738's
 * census; P3 and P7 give the same weights to a basis point). P5 sits mid-pool, radius 582.
 */
const P5_ORE_UNITS = [13341, 53203, 50262, 21335, 2265]

/** `1.5^k`, as a float for the census sums. */
function multiplierOf(tierOffset: number): number {
  return Number(toCanonical(rarityMultiplierOf(tierOffset)))
}

/** `1.5^(b-1)`: band `b`'s own ore value over band 1's. */
function bandValueOf(band: number): number {
  return multiplierOf(band - 1)
}

/** The nearest whole number, a half rounded down, as the rarity solve rounds (`raritySolve.ts`). */
function roundHalfDown(value: number): number {
  const whole = Math.floor(value)
  return value - whole > 0.5 ? whole + 1 : whole
}

/** The tier's value over the census planet's ore, in weight-units: `sum_b w_b U_b V(t_b)`. */
function tierValueOf(weightsBp: readonly number[]): number {
  return BANDS.reduce(
    (sum, band) => sum + weightsBp[band - 1] * P5_ORE_UNITS[band - 1] * bandValueOf(band),
    0,
  )
}

function weightsOf(set: 'mixed' | 'deep', tierOffset: number): number[] {
  return BANDS.map((band) => rarityWeightBpOf(set, tierOffset, band))
}

/** The band shape a tier keeps: mythic is live from band 4 (P&N windows), so it starts there. */
function shapeOf(tierOffset: number): number[] {
  return tierOffset === MYTHIC ? [0, 0, 0, 2, 4] : QUARTERS_OF_BAND_FIVE
}

describe('deep rare rows (ticket 738)', () => {
  it('draws no rare, epic or mythic above band 3, d >= 0.35', () => {
    for (const tierOffset of DEEP_TIERS)
      expect(weightsOf('deep', tierOffset).slice(0, 2)).toEqual([0, 0])
  })

  it('weights each tier 0.25, 0.5 and 1 of its band-5 weight toward the core, a half rounded down', () => {
    for (const tierOffset of DEEP_TIERS) {
      const weights = weightsOf('deep', tierOffset)
      const bandFive = weights[4]
      const shaped = shapeOf(tierOffset).map((quarters) => roundHalfDown((quarters * bandFive) / 4))
      expect(weights).toEqual(shaped)
    }
  })

  it("keeps the mixed rows' uncommon weights, so commons and uncommons keep their placement", () => {
    expect(weightsOf('deep', 1)).toEqual(weightsOf('mixed', 1))
    expect(weightsOf('deep', 1)[0]).toBeGreaterThan(0)
  })

  it("sets each tier's band-5 weight to the whole basis point that keeps its value over a planet", () => {
    for (const tierOffset of DEEP_TIERS) {
      const shapedValue = tierValueOf(shapeOf(tierOffset).map((quarters) => quarters / 4))
      const keptBandFive = tierValueOf(weightsOf('mixed', tierOffset)) / shapedValue
      expect(Math.abs(weightsOf('deep', tierOffset)[4] - keptBandFive)).toBeLessThanOrEqual(0.5)
    }
  })

  it('moves rare value from band 2 into bands 3 to 5 and adds none to the planet, within a basis point', () => {
    const planetValueOf = (set: 'mixed' | 'deep') =>
      BANDS.reduce(
        (sum, band) => sum + bandMeanOf(set, band) * P5_ORE_UNITS[band - 1] * bandValueOf(band),
        0,
      )
    const shiftBp =
      ((planetValueOf('deep') - planetValueOf('mixed')) / planetValueOf('mixed')) * 10000
    expect(Math.abs(shiftBp)).toBeLessThan(1)
    expect(bandMeanOf('deep', 2)).toBeLessThan(bandMeanOf('mixed', 2))
    expect(bandMeanOf('deep', 5)).toBeGreaterThan(bandMeanOf('mixed', 5))
  })
})

/** A band's mean ore value over its own tier's, in basis points: common carries what the rest leave. */
function bandMeanOf(set: 'mixed' | 'deep', band: number): number {
  const lifts = [1, RARE, EPIC, MYTHIC].map(
    (tierOffset) => rarityWeightBpOf(set, tierOffset, band) * (multiplierOf(tierOffset) - 1),
  )
  return 10000 + lifts.reduce((sum, lift) => sum + lift, 0)
}
