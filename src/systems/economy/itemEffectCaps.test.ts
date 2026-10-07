import { describe, expect, it } from 'vitest'
import { ECONOMY } from './economy'
import { createFieldReader } from './economyFieldReader'
import { cappedBoostBp, flooredScaleBp, readItemEffectCaps } from './itemEffectCaps'

// The kernel's vertical caps on slice items (GD lock on #204, ticket 233).

const { motionBoostCapBp, damageFloorBp } = ECONOMY.itemEffectCaps

describe('item effect caps', () => {
  it('reads +2000 bp of motion and a 50% damage floor from economy.json', () => {
    expect(motionBoostCapBp).toBe(2000)
    expect(damageFloorBp).toBe(5000)
  })

  it('adds motion boosts together up to the +2000 bp cap', () => {
    expect(cappedBoostBp([], motionBoostCapBp)).toBe(0)
    expect(cappedBoostBp([800, 700], motionBoostCapBp)).toBe(1500)
    expect(cappedBoostBp([1500, 1500], motionBoostCapBp)).toBe(2000)
    expect(cappedBoostBp([6667], motionBoostCapBp)).toBe(2000)
  })

  it('never lets motion boosts take the engine below its own track', () => {
    expect(cappedBoostBp([-3000, 1000], motionBoostCapBp)).toBe(0)
  })

  it('multiplies damage scales and never goes below half the base', () => {
    expect(flooredScaleBp([], damageFloorBp)).toBe(10000)
    expect(flooredScaleBp([8000], damageFloorBp)).toBe(8000)
    expect(flooredScaleBp([8000, 8000], damageFloorBp)).toBe(6400)
    expect(flooredScaleBp([8000, 5000], damageFloorBp)).toBe(5000)
    expect(flooredScaleBp([0], damageFloorBp)).toBe(5000)
  })

  it('treats a scale above the whole as the whole, so an intercept never adds damage', () => {
    expect(flooredScaleBp([15000, 9000], damageFloorBp)).toBe(9000)
  })

  it('refuses a cap outside 0 to 10000 basis points', () => {
    const reader = createFieldReader()
    readItemEffectCaps(reader, {
      motionBoostCapBp: 2000,
      damageFloorBp: 12000,
      detectionFloorBp: -1,
      heatFloorBp: 5000,
    })
    expect(reader.problems).toEqual([
      'itemEffectCaps.damageFloorBp must be 0 to 10000 basis points',
      'itemEffectCaps.detectionFloorBp must be 0 to 10000 basis points',
    ])
  })
})
