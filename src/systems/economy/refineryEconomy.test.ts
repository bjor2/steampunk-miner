import { describe, expect, it } from 'vitest'
import { fromCanonical } from '../money'
import economyFile from './economy.json'
import { oreTier } from './oreEconomy'
import {
  doesRefiningBeatSelling,
  rawRefineValue,
  refineBatchCap,
  refinedValue,
  refinerySlotPrice,
  refineryUnlockPlanet,
  refinerySlotsMax,
  refinerySlotsStart,
  refineSeconds,
} from './refineryEconomy'

const m = fromCanonical

describe('refinery economy', () => {
  it('reads the #105 refinery block: P3, one slot raised to three, 180 s at 1.25', () => {
    expect(economyFile.refinery).toEqual({
      unlockPlanet: 3,
      slotsStart: 1,
      slotsMax: 3,
      batchCargoFraction: '0.5',
      refineSeconds: 180,
      valueMultiplier: '1.25',
      slotCostCurveId: 'cost.refinery.slot',
    })
    expect([refineryUnlockPlanet(), refinerySlotsStart(), refinerySlotsMax()]).toEqual([3, 1, 3])
    expect(refineSeconds()).toBe(180)
  })

  it('prices slot 2 at 20 and slot 3 at 40 band-5 ore units of the purchase planet', () => {
    expect(refinerySlotPrice(3, 1)).toEqual(m('11533.008'))
    expect(refinerySlotPrice(3, 2)).toEqual(m('23066.016'))
    expect(refinerySlotPrice(4, 1)).toEqual(m('38923.902'))
  })

  it('has no price past the third slot', () => {
    expect(refinerySlotPrice(3, 3)).toBeNull()
  })

  it('holds a batch of half the hold, rounded down', () => {
    expect(refineBatchCap(10)).toBe(5)
    expect(refineBatchCap(13)).toBe(6)
  })

  it('pays floorMilli(units x V x 1.25) for a batch, against units x floorMilli(V) raw', () => {
    const tier = oreTier(3, 1)
    expect(refinedValue(tier, 5)).toEqual(m('711.914'))
    expect(rawRefineValue(tier, 5)).toEqual(m('569.53'))
  })

  it('beats selling raw at a 5 minute return and loses at 15, at 2.5% a minute growth', () => {
    expect(doesRefiningBeatSelling(5, m('0.025'))).toBe(true)
    expect(doesRefiningBeatSelling(15, m('0.025'))).toBe(false)
  })
})
