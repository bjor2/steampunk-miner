import { describe, expect, it } from 'vitest'
import { inRadiusCount } from '../authority/charges/blastFront'
import { chargePrice, chargeRadiusMm } from '../economy/chargeSizes'
import { oreSalePrice, oreTier } from '../economy/oreEconomy'
import { div, fromSafeInteger, mul, toCanonical } from '../money'
import { planetParamsFor } from '../world/planetParams'
import {
  chargePayoffOf,
  chargePayoffsOf,
  isUnderPayoffFloor,
  PAYOFF_BANDS,
  PAYOFF_LEADS,
  PAYOFF_PLANETS,
} from './chargePayoff'

const WORLD_SEED = 83921

describe('charge payoff guard (#143 guard 2, GD lock on K8 #218)', () => {
  it('reports planets 7 to 40 and 50, bands 3 to 5, leads +1 and +2', () => {
    const rows = chargePayoffsOf(WORLD_SEED)
    expect(PAYOFF_PLANETS).toHaveLength(35)
    expect(PAYOFF_PLANETS.at(-1)).toBe(50)
    expect(rows).toHaveLength(PAYOFF_PLANETS.length * PAYOFF_BANDS.length * PAYOFF_LEADS.length)
    expect(new Set(rows.map((row) => row.band))).toEqual(new Set([3, 4, 5]))
  })

  it('asks for the minCharge of the lead cell, never a size above its band', () => {
    const params = planetParamsFor(WORLD_SEED, 22)
    expect(chargePayoffOf(params, 5, 1).size).toBe(5)
    expect(chargePayoffOf(params, 3, 2).size).toBe(3)
    expect(chargePayoffOf(planetParamsFor(WORLD_SEED, 7), 5, 2).size).toBe(1)
  })

  it("frees no more cells than the band's mean patch, nor than the radius holds", () => {
    const params = planetParamsFor(WORLD_SEED, 40)
    const band5 = chargePayoffOf(params, 5, 2)
    expect(band5.cellsFreed).toBe(params.patchMeanCells[4])
    const small = chargePayoffOf({ ...params, patchMeanCells: [999, 999, 999, 999, 999] }, 3, 1)
    expect(small.cellsFreed).toBe(inRadiusCount(chargeRadiusMm(small.size)))
  })

  it('sells the freed cells at the lead tier and charges one minCharge at its price', () => {
    const params = planetParamsFor(WORLD_SEED, 19)
    const row = chargePayoffOf(params, 4, 2)
    const value = mul(fromSafeInteger(row.cellsFreed), oreSalePrice(oreTier(19, 4) + 2))
    expect(row.valueFreed).toEqual(value)
    expect(row.price).toEqual(chargePrice(row.size, 1, 19))
    expect(toCanonical(row.payoff)).toBe(toCanonical(div(value, row.price)))
  })

  it('reads a row under the floor of 2 as under, and one at it as not', () => {
    const params = planetParamsFor(WORLD_SEED, 22)
    const empty = chargePayoffOf({ ...params, patchMeanCells: [0, 0, 0, 0, 0] }, 5, 1)
    expect(isUnderPayoffFloor(empty)).toBe(true)
    expect(isUnderPayoffFloor({ ...empty, payoff: fromSafeInteger(2) })).toBe(false)
  })
})
