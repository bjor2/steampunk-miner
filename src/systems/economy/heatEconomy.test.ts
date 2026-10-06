import { describe, expect, it } from 'vitest'
import {
  add,
  ceilMilli,
  cmp,
  div,
  fromCanonical,
  fromSafeInteger,
  mul,
  toCanonical,
} from '../money'
import { gunMountPrice } from './gunStats'
import {
  bandHeatPerSecond,
  drillHeatPerSecond,
  hazardArchetypeOn,
  hazardContactDamage,
  hazardPocketVolume,
  heatArchetype,
  heatCoolingPerSecond,
  heatDamagePerSecond,
  isHeatPlanet,
  liningTypePriceMultiplier,
  liningTypes,
  liningTypeUnlockPrice,
  throttleFactor,
} from './heatEconomy'
import { oreTier, oreValue } from './oreEconomy'

describe('heat archetype numbers (#113)', () => {
  it('makes the Fire act, planets 8 to 16, the heat planets and no other', () => {
    expect([7, 8, 12, 16, 17].map(isHeatPlanet)).toEqual([false, true, true, true, false])
    expect(hazardArchetypeOn(1)).toBeNull()
  })

  it('heats band 5 while drilling at 0.65 a second on planet 8, so 70 comes after about 108 s', () => {
    const perSecond = add(bandHeatPerSecond(8, 5), drillHeatPerSecond(8))
    expect(perSecond).toEqual(fromCanonical('0.65'))
    const seconds = Number(toCanonical(div(fromSafeInteger(70), perSecond)))
    expect(seconds).toBeGreaterThan(103)
    expect(seconds).toBeLessThan(113)
  })

  it('leaves band 1 cold and reaches throttle in band 5 alone in about 2.3 minutes', () => {
    expect(bandHeatPerSecond(8, 1)).toEqual(fromCanonical('0'))
    expect(div(fromSafeInteger(70), bandHeatPerSecond(8, 5))).toEqual(fromCanonical('140'))
  })

  it('runs 4% hotter a planet into the act, held at 1.35 times the data', () => {
    expect(bandHeatPerSecond(9, 5)).toEqual(fromCanonical('0.52'))
    expect(bandHeatPerSecond(16, 5)).toEqual(fromCanonical('0.675'))
  })

  it('heats the core like band 5 and nothing off the act', () => {
    expect(bandHeatPerSecond(8, 6)).toEqual(bandHeatPerSecond(8, 5))
    expect(bandHeatPerSecond(7, 5)).toEqual(fromCanonical('0'))
    expect(drillHeatPerSecond(17)).toEqual(fromCanonical('0'))
  })

  it('cools a refractory corridor faster than any band heats, even at the act tail', () => {
    const corridor = heatCoolingPerSecond(16, 'liningCorridor')
    expect(cmp(corridor, bandHeatPerSecond(16, 5))).toBe(1)
    expect(heatCoolingPerSecond(8, 'idle')).toEqual(fromCanonical('0.4'))
    expect(heatCoolingPerSecond(8, 'surface')).toEqual(fromCanonical('10'))
    expect(heatCoolingPerSecond(8, 'none')).toEqual(fromCanonical('0'))
  })

  it('throttles the drill linearly from 70 down to half power at 100', () => {
    const heat = heatArchetype()
    const at = (points: number) =>
      Number(toCanonical(throttleFactor(heat, fromSafeInteger(points))))
    expect([at(0), at(70), at(85), at(100)]).toEqual([1, 1, 0.75, 0.5])
  })

  it('takes 2% of hullMax a second at the max and 5% a lava touch', () => {
    const heat = heatArchetype()
    expect(heatDamagePerSecond(heat, fromCanonical('200'))).toEqual(fromCanonical('4'))
    expect(hazardContactDamage(heat, fromCanonical('200'))).toEqual(fromCanonical('10'))
    expect(heat.hazardContact.heat).toBe(25)
  })

  it('leaves band 1 free of lava and fills 4% of band 5', () => {
    const volumes = [1, 2, 3, 4, 5].map((band) => Number(toCanonical(hazardPocketVolume(8, band))))
    expect(volumes).toEqual([0, 0.01, 0.02, 0.03, 0.04])
    expect(hazardPocketVolume(3, 5)).toEqual(fromCanonical('0'))
  })

  it('prices refractory at 1.5 times the lining charge and the standard lining at 1', () => {
    expect(liningTypes()).toEqual(['standard', 'refractory'])
    expect(liningTypePriceMultiplier('refractory')).toEqual(fromCanonical('1.5'))
    expect(liningTypePriceMultiplier('standard')).toEqual(fromCanonical('1'))
  })

  it('unlocks refractory for 40 band-5 ore units at the purchase planet', () => {
    const expected = ceilMilli(mul(fromSafeInteger(40), oreValue(oreTier(8, 5))))
    expect(liningTypeUnlockPrice('refractory', 8)).toEqual(expected)
    expect(cmp(liningTypeUnlockPrice('refractory', 8), gunMountPrice(8))).toBe(1)
    expect(liningTypeUnlockPrice('standard', 8)).toEqual(fromCanonical('0'))
  })
})
