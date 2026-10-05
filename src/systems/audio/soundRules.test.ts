import { describe, expect, it } from 'vitest'
import { CHIME_BASE_HZ } from '../../constants/audio'
import {
  chimeFrequencyOf,
  chimeSemitonesOf,
  drillLoadOf,
  drillVoiceOf,
  engineVoiceOf,
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
    const soft = drillVoiceOf(true, drillLoadOf(0.3))
    const hard = drillVoiceOf(true, drillLoadOf(2))
    expect(hard.frequency).toBeLessThan(soft.frequency)
    expect(hard.gain).toBeGreaterThan(soft.gain)
  })

  it('keeps the drill load within 0 to 1 and silent with no tile', () => {
    expect(drillLoadOf(null)).toBe(0)
    expect(drillLoadOf(1e9)).toBeLessThan(1)
    expect(drillVoiceOf(false, 0.5).gain).toBe(0)
  })

  it('chugs faster and louder with speed, up to its top speed', () => {
    expect(engineVoiceOf(6).frequency).toBeGreaterThan(engineVoiceOf(0).frequency)
    expect(engineVoiceOf(-6)).toEqual(engineVoiceOf(6))
    expect(engineVoiceOf(100)).toEqual(engineVoiceOf(16))
  })

  it('hisses only while lifting', () => {
    expect(steamGainOf(false)).toBe(0)
    expect(steamGainOf(true)).toBeGreaterThan(0)
  })
})
