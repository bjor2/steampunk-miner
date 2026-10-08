import { describe, expect, it } from 'vitest'
import { RENDER_ORIGIN_REACH_MM } from '../../constants/physics'
import { isPastOriginReach, renderOriginNear } from './renderOrigin'

describe('render origin', () => {
  it('sits on the 32 m chunk corner nearest the rig', () => {
    expect(renderOriginNear(15_999, -16_001)).toEqual({ xMm: 0, yMm: -32_000 })
    expect(renderOriginNear(512_000_000 + 47_500, 1_250)).toEqual({ xMm: 512_032_000, yMm: 0 })
  })

  it('lies at most half a chunk diagonal from the rig, whatever the radius', () => {
    for (const radiusMm of [1_000_000, 8_000_000, 64_000_000, 512_000_000]) {
      const [x, y] = [radiusMm * 0.6 + 17_321, radiusMm * 0.8 - 9_871]
      const origin = renderOriginNear(x, y)
      expect(Math.abs(x - origin.xMm)).toBeLessThanOrEqual(16_000)
      expect(Math.abs(y - origin.yMm)).toBeLessThanOrEqual(16_000)
    }
  })

  it('stays put until the rig is more than 1 km from it', () => {
    const origin = renderOriginNear(64_000_000, 0)
    expect(isPastOriginReach(origin, 64_000_000 + 600_000, 800_000, RENDER_ORIGIN_REACH_MM)).toBe(
      false,
    )
    expect(isPastOriginReach(origin, 64_000_000 + 600_000, 800_001, RENDER_ORIGIN_REACH_MM)).toBe(
      true,
    )
  })
})
