import { describe, expect, it } from 'vitest'
import { blastCueOf, cueShareAtDistance, thumpDelayTicksOf } from './blastCue'

// The #143 ladder's radii for sizes 1, 5 and 10 (2.5, 8 and 24 tiles), fixtures only: the rule
// takes the radius from the detonation and holds no ladder of its own.
const SIZE_1 = { size: 1, radiusMm: 2500 }
const SIZE_5 = { size: 5, radiusMm: 8000 }
const SIZE_10 = { size: 10, radiusMm: 24000 }

describe('blast cue', () => {
  it('gives the shipped charge its cue of today at the blast tile: shake 0.8, no flash, no delay', () => {
    expect(blastCueOf(SIZE_1.size, SIZE_1.radiusMm, 0)).toEqual({
      shake: 0.8,
      flash: 0,
      thumpDelayTicks: 0,
    })
  })

  it('shakes and flashes harder with size, up to the full kick', () => {
    const size5 = blastCueOf(SIZE_5.size, SIZE_5.radiusMm, 0)
    const size10 = blastCueOf(SIZE_10.size, SIZE_10.radiusMm, 0)
    expect(size5.shake).toBeCloseTo(0.96)
    expect(size5.flash).toBeCloseTo(0.5)
    expect(size10).toMatchObject({ shake: 1, flash: 1 })
  })

  it('keeps the full kick anywhere inside the radius', () => {
    const atCentre = blastCueOf(SIZE_5.size, SIZE_5.radiusMm, 0)
    const atRim = blastCueOf(SIZE_5.size, SIZE_5.radiusMm, SIZE_5.radiusMm)
    expect(atRim.shake).toBe(atCentre.shake)
    expect(atRim.flash).toBe(atCentre.flash)
  })

  it('falls off to nothing at one and a half radii', () => {
    for (const { size, radiusMm } of [SIZE_1, SIZE_5, SIZE_10]) {
      const halfWay = blastCueOf(size, radiusMm, radiusMm * 1.25)
      const atReach = blastCueOf(size, radiusMm, radiusMm * 1.5)
      const beyond = blastCueOf(size, radiusMm, radiusMm * 3)
      expect(halfWay.shake).toBeCloseTo(blastCueOf(size, radiusMm, 0).shake / 2)
      expect(atReach).toMatchObject({ shake: 0, flash: 0 })
      expect(beyond).toMatchObject({ shake: 0, flash: 0 })
    }
  })

  it('still hits nearly full at the closest a remote planter may stand, a tile past the rim', () => {
    const cue = blastCueOf(SIZE_10.size, SIZE_10.radiusMm, SIZE_10.radiusMm + 1000)
    expect(cue.shake).toBeCloseTo(11 / 12)
    expect(cue.flash).toBeCloseTo(11 / 12)
  })

  it('shares the falloff between shake and flash', () => {
    expect(cueShareAtDistance(8000, 10000)).toBeCloseTo(0.5)
    expect(cueShareAtDistance(8000, 7999)).toBe(1)
    expect(cueShareAtDistance(0, 1)).toBe(0)
  })

  it('delays the thump a tick per tile of distance, to at most a second', () => {
    expect(thumpDelayTicksOf(0)).toBe(0)
    expect(thumpDelayTicksOf(3750)).toBe(3)
    expect(thumpDelayTicksOf(SIZE_10.radiusMm * 1.5)).toBe(36)
    expect(thumpDelayTicksOf(100000)).toBe(60)
    expect(thumpDelayTicksOf(-500)).toBe(0)
  })

  it('delays the thump the same way whatever the size', () => {
    const delays = [SIZE_1, SIZE_5, SIZE_10].map(
      ({ size, radiusMm }) => blastCueOf(size, radiusMm, 6000).thumpDelayTicks,
    )
    expect(delays).toEqual([6, 6, 6])
  })
})
