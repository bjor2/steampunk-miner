import { describe, expect, it } from 'vitest'
import { CHIME_BASE_HZ } from '../../constants/audio'
import {
  chimeFrequencyOf,
  chimeSemitonesOf,
  drillFrequencyOf,
  drillGainOf,
  drillLoadOf,
  engineGainOf,
  enginePuffsOf,
  secondsPerTileOf,
  steamGainOf,
} from './soundRules'

const ORE_TIERS = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const MAJOR_STEPS = [2, 2, 1, 2, 2, 2, 1]

describe('pickup chime', () => {
  it('rises with every resource tier of the slice', () => {
    const frequencies = ORE_TIERS.map(chimeFrequencyOf)
    frequencies
      .slice(1)
      .forEach((frequency, at) => expect(frequency).toBeGreaterThan(frequencies[at]))
  })

  it('climbs the major scale, one degree a tier, from tier 1 on the base note', () => {
    expect(chimeFrequencyOf(1)).toBe(CHIME_BASE_HZ)
    const steps = [1, 2, 3, 4, 5, 6, 7, 8].map(
      (tier) => chimeSemitonesOf(tier + 1) - chimeSemitonesOf(tier),
    )
    expect(steps.slice(0, 7)).toEqual(MAJOR_STEPS)
    expect(chimeSemitonesOf(8)).toBe(12)
  })

  it('never falls as the tier rises, and stays audible for any tier', () => {
    const tiers = [1, 10, 22, 23, 100, 1_000_000]
    const frequencies = tiers.map(chimeFrequencyOf)
    frequencies
      .slice(1)
      .forEach((frequency, at) => expect(frequency).toBeGreaterThanOrEqual(frequencies[at]))
    expect(chimeFrequencyOf(1_000_000)).toBe(CHIME_BASE_HZ * 8)
  })
})

describe('drill, engine and steam voices', () => {
  it('drops the drill pitch and raises its volume as the tile takes longer', () => {
    const soft = drillLoadOf(0.3)
    const hard = drillLoadOf(2)
    expect(drillFrequencyOf(hard)).toBeLessThan(drillFrequencyOf(soft))
    expect(drillGainOf(true, hard)).toBeGreaterThan(drillGainOf(true, soft))
  })

  it('keeps the drill load within 0 to 1 and silent with no tile', () => {
    expect(drillLoadOf(secondsPerTileOf({ state: 'none', text: '-' }))).toBe(0)
    expect(drillLoadOf(1e9)).toBeLessThan(1)
    expect(drillLoadOf(secondsPerTileOf({ state: 'blocked', text: 'needs a better tip' }))).toBe(1)
    expect(secondsPerTileOf({ state: 'time', text: '0.50 s', ticks: 30 })).toBe(0.5)
    expect(drillGainOf(false, 0.5)).toBe(0)
  })

  it('chugs faster and louder with speed, up to its top speed', () => {
    expect(enginePuffsOf(6)).toBeGreaterThan(enginePuffsOf(0))
    expect(engineGainOf(6)).toBeGreaterThan(engineGainOf(0))
    expect(enginePuffsOf(-6)).toBe(enginePuffsOf(6))
    expect(enginePuffsOf(100)).toBe(enginePuffsOf(16))
  })

  it('hisses only while lifting', () => {
    expect(steamGainOf(false)).toBe(0)
    expect(steamGainOf(true)).toBeGreaterThan(0)
  })
})
