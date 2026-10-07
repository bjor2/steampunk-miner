import { describe, expect, it } from 'vitest'
import { add, cmp, div, fromCanonical, fromSafeInteger, mul, sub, type Money } from '../money'
import { oreSalePrice, oreTier } from './oreEconomy'
import { rechargePrice, repairPrice, rescueFeeBounds } from './planetCharges'
import { paceScale } from './planetEconomy'
import { upgradePrice } from './upgradePrices'
import { cargoCapacity, energyMax, hullMax, onCurveLevel } from './vehicleStats'

const m = fromCanonical
const BRASS_TRACKS = ['cargo_hold', 'boiler', 'engine', 'hull'] as const
const DEEPEST_BAND = 5
const FIRST_PLANET = 1

type BrassTrack = (typeof BRASS_TRACKS)[number]

/** The next brass step an on-curve player buys on a planet: one level (one pip after #180). */
function nextBrassStepPrice(track: BrassTrack, planetIndex: number): Money {
  return upgradePrice(track, onCurveLevel(track, planetIndex), planetIndex)
}

/**
 * The curve's own drift against ore, with the planet's pace row taken back out: `paceScale(p)` is
 * the separate per-planet lever (#131, #137 put planets 8 to 10 at 0.75), multiplying every track
 * alike, so it is not a change in the curve's shape.
 */
function band5OreUnitsPerBrassStepBeforePace(track: BrassTrack, planetIndex: number): Money {
  const curvePrice = div(nextBrassStepPrice(track, planetIndex), paceScale(planetIndex))
  return div(curvePrice, band5SalePrice(planetIndex))
}

function band5SalePrice(planetIndex: number): Money {
  return oreSalePrice(oreTier(planetIndex, DEEPEST_BAND))
}

/** A full on-curve hold of band-5 ore sold at the dock: the synthetic on-curve wallet. */
function fullHoldSale(planetIndex: number): Money {
  const units = fromSafeInteger(cargoCapacity(onCurveLevel('cargo_hold', planetIndex)))
  return mul(units, band5SalePrice(planetIndex))
}

/** A full repair and a full recharge of the on-curve vehicle, held back before any upgrade. */
function serviceReserve(planetIndex: number): Money {
  const fullHull = hullMax(onCurveLevel('hull', planetIndex))
  const fullTank = fromSafeInteger(energyMax(onCurveLevel('boiler', planetIndex)))
  return add(repairPrice(planetIndex, fullHull, fullHull), rechargePrice(planetIndex, fullTank))
}

/** The wallet after the reserve and one tow at the fee's cap, the dearest a rescue can be. */
function walletLeftForBrass(planetIndex: number): Money {
  const afterReserve = sub(fullHoldSale(planetIndex), serviceReserve(planetIndex))
  return sub(afterReserve, rescueFeeBounds(planetIndex).cap)
}

function cheapestBrassStep(planetIndex: number): Money {
  const prices = BRASS_TRACKS.map((track) => nextBrassStepPrice(track, planetIndex))
  return prices.reduce((cheapest, price) => (cmp(price, cheapest) < 0 ? price : cheapest))
}

describe('brass steps against ore income (#195)', () => {
  it.each([10, 20, 40])(
    'keeps the band-5 ore units per next brass step, before the pace row, within 1.2x of planet 1 on planet %i',
    (planetIndex) => {
      for (const track of BRASS_TRACKS) {
        const drift = div(
          band5OreUnitsPerBrassStepBeforePace(track, planetIndex),
          band5OreUnitsPerBrassStepBeforePace(track, FIRST_PLANET),
        )
        expect({ track, belowCeiling: cmp(drift, m('1.2')) < 0 }).toEqual({
          track,
          belowCeiling: true,
        })
        expect({ track, aboveFloor: cmp(drift, div(m('1'), m('1.2'))) > 0 }).toEqual({
          track,
          aboveFloor: true,
        })
      }
    },
  )

  it.each([40, 100])(
    'leaves an on-curve hold on planet %i enough for one brass step after the reserve and a rescue',
    (planetIndex) => {
      expect(cmp(cheapestBrassStep(planetIndex), walletLeftForBrass(planetIndex))).toBeLessThan(1)
    },
  )
})
