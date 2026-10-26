import { describe, expect, it } from 'vitest'
import { baseR2Of, groundR2Of } from '../authority/charges/blastDisc'
import { toCanonical } from '../money'
import { blastRadiusLevelPrice } from './blastingCharges'
import { chargeRadiusMm, chargeUnitPrice } from './chargeSizes'
import economyFile from './economy.json'
import { readEconomy } from './readEconomy'

// D6 #865, the dynamite economy rows: the charge price P_i(g) = k_dyn * V(t_top(g)) * cells^0.85
// on base cells, the Blast Radius track's per-purchase curve, and the goldens at L = 0, 10 and 1e6
// in bigint. A golden changes only with a row of the design, never to make a test pass.
const SIZES = Array.from({ length: 12 }, (_, at) => at + 1)
const LEVELS = [0, 10, 1_000_000] as const

function economyWithCharges(charges: Record<string, unknown>) {
  return { ...economyFile, blastingCharges: { ...economyFile.blastingCharges, ...charges } }
}

function problemsOf(charges: Record<string, unknown>): string[] {
  return readEconomy(economyWithCharges(charges)).problems
}

function pricesOn(planetIndex: number): string[] {
  return SIZES.map((size) => toCanonical(chargeUnitPrice(size, planetIndex)))
}

describe('dynamite economy rows', () => {
  it('reads the committed price, track and node rows with no problems', () => {
    expect(readEconomy(economyFile).problems).toEqual([])
  })

  it('pins the twelve charge prices on planets 1 and 5 (golden)', () => {
    expect(pricesOn(1)).toEqual([
      '6.8e+1',
      '1.09e+2',
      '1.86e+2',
      '2.82e+2',
      '4.52e+2',
      '6.77e+2',
      '1.046e+3',
      '1.482e+3',
      '2.182e+3',
      '2.951e+3',
      '4.338e+3',
      '6.198e+3',
    ])
    expect(pricesOn(5)).toEqual([
      '8.737e+3',
      '1.414e+4',
      '2.4015e+4',
      '3.6524e+4',
      '5.8581e+4',
      '8.7773e+4',
      '1.35644e+5',
      '1.92177e+5',
      '2.83071e+5',
      '3.82828e+5',
      '5.62734e+5',
      '8.04095e+5',
    ])
  })

  it('pins the smallest and largest charge on planets 40 and 1e6 as whole money (golden)', () => {
    expect(toCanonical(chargeUnitPrice(1, 40))).toBe('2.6972968565875486250292e+22')
    expect(toCanonical(chargeUnitPrice(12, 40))).toBe('2.482499107006381485375317e+24')
    expect(toCanonical(chargeUnitPrice(1, 1_000_000))).toBe(
      '1.19438599764408790360277070906574935376e+528275',
    )
    expect(toCanonical(chargeUnitPrice(12, 1_000_000))).toBe(
      '1.099271726555002031199859203896550843274e+528277',
    )
  })

  it('pins the ground r² of sizes 1, 6 and 12 at L = 0, 10 and 1e6 in bigint, base r² unmoved (golden)', () => {
    const groundOf = (size: number) =>
      LEVELS.map((radiusLevel) => groundR2Of({ radiusMm: chargeRadiusMm(size), radiusLevel }))
    expect(groundOf(1)).toEqual([400n, 650n, 25_000_400n])
    expect(groundOf(6)).toEqual([6_400n, 10_400n, 400_006_400n])
    expect(groundOf(12)).toEqual([87_616n, 142_376n, 5_476_087_616n])
    for (const radiusLevel of LEVELS) {
      expect(baseR2Of({ radiusMm: chargeRadiusMm(12), radiusLevel })).toBe(87_616n)
    }
  })

  it('pins the Blast Radius price at L = 0, 10 and 1e6 on planet 1 (golden)', () => {
    expect(LEVELS.map((level) => toCanonical(blastRadiusLevelPrice(level, 1)))).toEqual([
      '5e+1',
      '5.498e+3',
      '4.804253653884921470197257696099483569332e+204121',
    ])
  })

  it('refuses a price coefficient of 0, a band under 1 and a cells exponent past 1', () => {
    const problems = problemsOf({ price: { kDyn: '0', worthBand: 0, cellsExponent: '1.2' } })
    expect(problems).toEqual(
      expect.arrayContaining([
        'blastingCharges.price.kDyn must be above 0',
        'blastingCharges.price.worthBand must be at least 1',
        'blastingCharges.price.cellsExponent must lie above 0 and at most 1',
      ]),
    )
  })

  it('refuses Blast Casing anchored after blastBit', () => {
    const problems = problemsOf({ nodePriceAnchors: { blastCasing: 9, blastBit: 8 } })
    expect(problems).toContain(
      'blastingCharges.nodePriceAnchors.blastCasing must not be anchored after blastBit',
    )
  })

  it('refuses a Blast Radius track not priced per purchase', () => {
    const radiusTrack = { levelDivisor: 16, exponent: '0.5', costCurveId: 'cost.vehicle.hull' }
    expect(problemsOf({ radiusTrack })).toContain(
      'blastingCharges.radiusTrack.costCurveId cost.vehicle.hull has no geometricPerPurchase curve',
    )
  })
})
