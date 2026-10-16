import { describe, expect, it } from 'vitest'
import {
  add,
  cmp,
  div,
  fromSafeInteger,
  mul,
  sub,
  toCanonical,
  ZERO_MONEY,
  type Money,
} from '../../../systems/money'
import {
  bandMeanValueBpOf,
  isTierLiveIn,
  mixedRowsFromPlanet,
  ORE_ROWS,
  ORE_RULES_VERSION,
  rarityMultiplierOf,
  rarityRowSetOf,
  rarityTiers,
  rarityWeightBpOf,
  solvedRarityWeightsBp,
  type RarityRowSet,
} from '../../ores'
import { isMixedPlanet, signatureLeadOf } from './oreMix'
import { THEME_ROWS } from './themeRows'

// Ticket 445 acceptance, Systems on #139 (comment 6202970624 sections 2 and 7.1): rarity is
// mean-neutral. The mean value of one ore unit of every band is today's on every planet, within
// `meanToleranceBp`, with the planet's base signature share (story and lava boosts were not
// mean-preserved before either, and Systems left them alone).

const BANDS = [1, 2, 3, 4, 5]
const PLANETS = Array.from({ length: 200 }, (_, at) => at + 1)
const RATED_OFFSETS = [1, 2, 3, 4]

function signatureBpOf(planetIndex: number, band: number): number {
  return isMixedPlanet(planetIndex) ? THEME_ROWS.signatureShareBpByBand[band - 1] : 0
}

/** The signature sells at `t_5 + 1`: this many tiers above band `band`'s own. */
function signatureOffsetOf(band: number): number {
  return signatureLeadOf(band) + ORE_ROWS.signatureValueLead
}

function weightsBpOf(set: RarityRowSet, band: number, signatureBp: number): number[] {
  const rated = RATED_OFFSETS.map((offset) => rarityWeightBpOf(set, offset, band))
  const drawn = rated.reduce((sum, weight) => sum + weight, 0)
  return [10000 - signatureBp - drawn, ...rated]
}

/** Today: the lead rows, the signature carved from the lead of its own tier `t_5`. */
function todayMeanBpOf(planetIndex: number, band: number): Money {
  const signatureBp = signatureBpOf(planetIndex, band)
  const weights = weightsBpOf('legacy', band, 0)
  weights[signatureLeadOf(band)] -= signatureBp
  return bandMeanValueBpOf(weights, signatureBp, signatureOffsetOf(band))
}

/** The new rows: the planet's set, the signature carved from common. */
function newMeanBpOf(planetIndex: number, band: number): Money {
  const signatureBp = signatureBpOf(planetIndex, band)
  const set = rarityRowSetOf(planetIndex, ORE_RULES_VERSION)
  const weights = weightsBpOf(set, band, signatureBp)
  return bandMeanValueBpOf(weights, signatureBp, signatureOffsetOf(band))
}

function absolute(amount: Money): Money {
  return cmp(amount, ZERO_MONEY) < 0 ? sub(ZERO_MONEY, amount) : amount
}

describe('rarity mean value', () => {
  it("keeps every band's mean value per ore unit within half a basis point of today's, P1-P200", () => {
    for (const planetIndex of PLANETS) {
      for (const band of BANDS) {
        const error = absolute(
          sub(newMeanBpOf(planetIndex, band), todayMeanBpOf(planetIndex, band)),
        )
        expect(cmp(error, ORE_ROWS.rarity.meanToleranceBp)).toBeLessThanOrEqual(0)
      }
    }
  })

  it("stores today's band means, lead rows and signatures included, as the solve target", () => {
    const stored = BANDS.map((band) =>
      toCanonical(fromSafeInteger(ORE_ROWS.rarity.meanPpmByBand[band - 1])),
    )
    const today = BANDS.map((band) =>
      toCanonical(mul(todayMeanBpOf(mixedRowsFromPlanet(), band), fromSafeInteger(100))),
    )
    expect(today).toEqual(stored)
  })

  it('stores the mixed weights as the solve of those means with the planet signature', () => {
    const planetIndex = mixedRowsFromPlanet()
    for (const band of BANDS) {
      const liveOffsets = rarityTiers()
        .filter((tier) => tier.tierOffset > 0 && isTierLiveIn(tier, planetIndex, band))
        .map((tier) => tier.tierOffset)
      const signatureBp = signatureBpOf(planetIndex, band)
      const solved = solvedRarityWeightsBp({
        meanPpm: ORE_ROWS.rarity.meanPpmByBand[band - 1],
        liveOffsets,
        signatureBp,
        signatureOffset: signatureOffsetOf(band),
      })
      expect(solved).toEqual(weightsBpOf('mixed', band, signatureBp))
    }
  })

  it('keeps every non-common tier within 650 bp of a band trip, and epic with mythic within 1500', () => {
    // Vertical Scaler's share bounds (TD ruling on #445, section 6): nominal, a hold filled in one band.
    for (const planetIndex of PLANETS) {
      for (const band of BANDS) {
        const signatureBp = signatureBpOf(planetIndex, band)
        const set = rarityRowSetOf(planetIndex, ORE_RULES_VERSION)
        const weights = weightsBpOf(set, band, signatureBp)
        const total = bandMeanValueBpOf(weights, signatureBp, signatureOffsetOf(band))
        const shareBpOf = (valueBp: Money) => div(mul(valueBp, fromSafeInteger(10000)), total)
        const tierValues = RATED_OFFSETS.map((offset) =>
          mul(fromSafeInteger(weights[offset]), rarityMultiplierOf(offset)),
        )
        const signature = mul(
          fromSafeInteger(signatureBp),
          rarityMultiplierOf(signatureOffsetOf(band)),
        )
        for (const value of [...tierValues, signature])
          expect(cmp(shareBpOf(value), fromSafeInteger(650))).toBeLessThanOrEqual(0)
        const epicAndMythic = add(tierValues[2], tierValues[3])
        expect(cmp(shareBpOf(epicAndMythic), fromSafeInteger(1500))).toBeLessThanOrEqual(0)
      }
    }
  })

  it('keeps P1 and P2 on the lead rows exactly', () => {
    for (const planetIndex of [1, 2]) {
      for (const band of BANDS)
        expect(cmp(newMeanBpOf(planetIndex, band), todayMeanBpOf(planetIndex, band))).toBe(0)
    }
  })
})
