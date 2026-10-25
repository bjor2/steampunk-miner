import { describe, expect, it } from 'vitest'
import { RIM_GLOW_PEAK_GAIN, RIM_GLOW_RISE_TICKS, RIM_GLOW_TICKS } from './blastLookConstants'
import { isRimGlowing, rimGlowGainOf } from './craterGlow'

describe('cased crater rim glow (D8 #868)', () => {
  it('is the plate tint before the blast and once the glow has settled', () => {
    expect(rimGlowGainOf(-1)).toBe(1)
    expect(rimGlowGainOf(RIM_GLOW_TICKS)).toBe(1)
    expect(isRimGlowing(RIM_GLOW_TICKS)).toBe(false)
  })

  it('peaks as the rise ends, then settles back over the glow ticks', () => {
    expect(rimGlowGainOf(RIM_GLOW_RISE_TICKS)).toBeCloseTo(RIM_GLOW_PEAK_GAIN, 6)
    const half = (RIM_GLOW_RISE_TICKS + RIM_GLOW_TICKS) / 2
    expect(rimGlowGainOf(half)).toBeCloseTo(1 + (RIM_GLOW_PEAK_GAIN - 1) / 2, 6)
    expect(rimGlowGainOf(0)).toBe(1)
    expect(isRimGlowing(0)).toBe(true)
  })
})
