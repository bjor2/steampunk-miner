import { describe, expect, it } from 'vitest'
import { baseTilesSqOf } from '../../../../systems/authority/charges/blastDisc'
import { ticksToClear } from '../../../../systems/authority/charges/blastFront'
import { previewBlastFrames, solidRockSlicesOf } from './blastPreview'

describe('blast preview', () => {
  it('slices an R24 blast as K6 clears it in solid rock: 29 rings, growing out to the radius', () => {
    const slices = solidRockSlicesOf(24000)
    expect(slices).toHaveLength(ticksToClear(baseTilesSqOf(24000)))
    expect(slices).toHaveLength(29)
    expect(slices[0][0]).toBe(0)
    expect(slices.at(-1)?.[1]).toBeLessThanOrEqual(24000)
    expect(slices.every(([inner, outer]) => inner <= outer)).toBe(true)
    expect(slices.every(([inner], at) => at === 0 || inner >= slices[at - 1][1])).toBe(true)
  })

  it('plays the detonation and its disc record on one frame, then one front a frame at the given tile', () => {
    const frames = previewBlastFrames({ tx: 3, ty: 250 }, 10, 24000)
    expect(frames).toHaveLength(30)
    expect(frames[0]).toEqual([
      expect.objectContaining({ type: 'ChargeDetonated', tx: 3, ty: 250, size: 10 }),
      expect.objectContaining({
        type: 'BlastStarted',
        tx: 3,
        ty: 250,
        size: 10,
        chargeType: 3,
        casingLaid: false,
      }),
    ])
    expect(frames.slice(1).every(([event]) => event.type === 'BlastFront')).toBe(true)
  })
})
