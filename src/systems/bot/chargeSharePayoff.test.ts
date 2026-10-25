import { describe, expect, it } from 'vitest'
import { baseTilesSqOf } from '../authority/charges/blastDisc'
import { inRadiusCount } from '../authority/charges/blastFront'
import { chargePrice, chargeRadiusMm, gateTierFor } from '../economy/chargeSizes'
import { oreTier } from '../economy/oreEconomy'
import { cmp, div, fromSafeInteger, toCanonical, ZERO_MONEY } from '../money'
import {
  chargeSharePayoffOf,
  chargeSharePayoffsOf,
  chargeSharePayoffsOnPlanet,
  type GatedMixBands,
  type GatedMixEntry,
} from './chargeSharePayoff'

/** A band of planet `p`: common cells, a +1 and a +2, either dynamite-gated or not. */
function bandOf(
  planetIndex: number,
  band: number,
  gates: { plusOne: boolean; plusTwo: boolean },
): GatedMixEntry[] {
  const tier = oreTier(planetIndex, band)
  const gateTier = (lead: number) => gateTierFor({ lead, band }, planetIndex)
  return [
    { tier, weightBp: 9000, signature: false, gateTier: null },
    {
      tier: tier + 1,
      weightBp: 700,
      signature: false,
      gateTier: gates.plusOne ? gateTier(1) : null,
    },
    {
      tier: tier + 2,
      weightBp: 300,
      signature: false,
      gateTier: gates.plusTwo ? gateTier(2) : null,
    },
  ]
}

function planetOf(planetIndex: number, dynamiteBands: readonly number[]): GatedMixBands {
  return [1, 2, 3, 4, 5].map((band) => {
    const isGated = dynamiteBands.includes(band)
    return bandOf(planetIndex, band, { plusOne: isGated, plusTwo: false })
  })
}

describe('charge payoff under the share model (ticket 247, Systems on K8 #218)', () => {
  it('prints only bands holding dynamite-gated lead cells', () => {
    const rows = chargeSharePayoffsOnPlanet(22, planetOf(22, [4]))
    expect(new Set(rows.map((row) => row.band))).toEqual(new Set([4]))
  })

  it('lists all twelve sizes in every gated band, every size sold on every planet (D4 #863)', () => {
    const twelve = Array.from({ length: 12 }, (_, at) => at + 1)
    const late = chargeSharePayoffsOnPlanet(40, planetOf(40, [3, 5]))
    expect(late.filter((row) => row.band === 3).map((row) => row.size)).toEqual(twelve)
    const first = chargeSharePayoffsOnPlanet(7, planetOf(7, [5]))
    expect(first.map((row) => row.size)).toEqual(twelve)
  })

  it('has no rows before planet 7 and covers planets 7 to 40 and 50', () => {
    const planets = new Set(
      chargeSharePayoffsOf((planetIndex) => planetOf(planetIndex, [5])).map(
        (row) => row.planetIndex,
      ),
    )
    expect(Math.min(...planets)).toBe(7)
    expect(planets.has(50)).toBe(true)
    expect(planets.size).toBe(35)
  })

  it('frees nothing with a size whose type does not break the cells gate tier', () => {
    const entries = bandOf(40, 5, { plusOne: true, plusTwo: false })
    const typeOne = chargeSharePayoffOf(40, 5, entries, 4)
    expect(cmp(typeOne.valueFreed, ZERO_MONEY)).toBe(0)
    expect(cmp(typeOne.payoff, ZERO_MONEY)).toBe(0)
    expect(cmp(chargeSharePayoffOf(40, 5, entries, 5).valueFreed, ZERO_MONEY)).toBe(1)
  })

  it('frees the gated share of the radius and divides by one charge of the size', () => {
    const entries = bandOf(22, 5, { plusOne: true, plusTwo: false })
    const row = chargeSharePayoffOf(22, 5, entries, 5)
    const radiusCells = inRadiusCount(baseTilesSqOf(chargeRadiusMm(5)))
    expect(toCanonical(row.gatedCells)).toBe(
      toCanonical(div(fromSafeInteger(radiusCells * 700), fromSafeInteger(10000))),
    )
    expect(row.price).toEqual(chargePrice(5, 1, 22))
    expect(toCanonical(row.payoff)).toBe(toCanonical(div(row.valueFreed, row.price)))
    expect(row.isCapped).toBe(false)
  })

  it('caps the gated value at 15% of the band', () => {
    const tier = oreTier(22, 5)
    const heavy: GatedMixEntry[] = [
      { tier, weightBp: 5000, signature: false, gateTier: null },
      { tier: tier + 1, weightBp: 5000, signature: false, gateTier: 2 },
    ]
    const capped = chargeSharePayoffOf(22, 5, heavy, 5)
    const light = chargeSharePayoffOf(22, 5, [heavy[0], { ...heavy[1], weightBp: 1 }], 5)
    expect(capped.isCapped).toBe(true)
    expect(light.isCapped).toBe(false)
  })
})
