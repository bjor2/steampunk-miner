import { describe, expect, it } from 'vitest'
import { SHIPPED_ART } from '../../../../scene/shippedArt'
import {
  fuseTicksLeftOf,
  isFuseLampLit,
  plantedBodyQuadsOf,
  plantedLampQuadsOf,
} from './plantedDynamiteLook'

describe('planted dynamite look', () => {
  it("draws each size's own body and lamp, so a size 10 is not a size 1", () => {
    for (const size of [1, 5, 10]) {
      expect(plantedBodyQuadsOf(SHIPPED_ART, size).map((quad) => quad.partId)).toEqual([
        `planted-${size}`,
      ])
      expect(plantedLampQuadsOf(SHIPPED_ART, size).map((quad) => quad.partId)).toEqual([
        `lamp-${size}`,
      ])
    }
  })

  it('grows the planted body from size 1 to size 10', () => {
    const widthOf = (size: number) => plantedBodyQuadsOf(SHIPPED_ART, size)[0].size[0]
    expect(widthOf(1)).toBeLessThan(widthOf(5))
    expect(widthOf(5)).toBeLessThan(widthOf(10))
  })

  it('blinks the lamp about four times a second, and faster in the last second', () => {
    expect([0, 0.3, 0.55].map((seconds) => isFuseLampLit(seconds, 100))).toEqual([
      true,
      false,
      true,
    ])
    expect([0, 0.15, 0.25].map((seconds) => isFuseLampLit(seconds, 60))).toEqual([
      true,
      false,
      true,
    ])
  })

  it('never hurries the lamp of a remote charge, which has no fuse', () => {
    const remote = { tx: 0, ty: 200, size: 8, plantedTick: 400, detonateTick: null }
    expect(fuseTicksLeftOf(remote, 500)).toBe(Number.POSITIVE_INFINITY)
    expect(fuseTicksLeftOf({ ...remote, size: 1, detonateTick: 520 }, 500)).toBe(20)
  })
})
