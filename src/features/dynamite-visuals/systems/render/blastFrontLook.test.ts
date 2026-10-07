import { describe, expect, it } from 'vitest'
import { COLLAPSE_DUST_CAPACITY, SPARK_CAPACITY } from '../../../../constants/scene'
import {
  blastFrontLookOf,
  blastRingOf,
  debrisCountOf,
  dustCountOf,
  fireCountOf,
  flashSpriteOf,
  frontLayerDrawOf,
  frontSprayOf,
  raisePeak,
  rimTilesOf,
  type FrontSpray,
} from './blastFrontLook'
import { BLAST_DEBRIS_CAPACITY, FLASH_FRAMES, FLASH_SPRITE_MAX_OPACITY } from './blastLookConstants'
import { solidRockSlicesOf } from './blastPreview'

// The #143 ladder's radii for sizes 1, 5 and 10 (2.5, 8 and 24 tiles), fixtures only.
const SIZE_1_MM = 2500
const SIZE_5_MM = 8000
const SIZE_10_MM = 24000

describe('blast front look', () => {
  it('rides the ring on the edge of the clearing', () => {
    expect(blastRingOf(SIZE_1_MM).radiusM).toBe(2.5)
    expect(blastRingOf(SIZE_5_MM).radiusM).toBe(8)
    expect(blastRingOf(SIZE_10_MM).radiusM).toBe(24)
  })

  it('thickens the ring with the radius, between half a tile and three tiles', () => {
    expect(blastRingOf(SIZE_1_MM).widthM).toBe(0.5)
    expect(blastRingOf(SIZE_5_MM).widthM).toBeCloseTo(1.6)
    expect(blastRingOf(SIZE_10_MM).widthM).toBe(3)
  })

  it('measures the rim in tiles', () => {
    expect(rimTilesOf(SIZE_1_MM)).toBeCloseTo(15.708)
    expect(rimTilesOf(SIZE_10_MM)).toBeCloseTo(150.796)
  })

  it('puts more fire, dust and debris on a longer rim', () => {
    expect(fireCountOf(SIZE_1_MM)).toBe(47)
    expect(fireCountOf(SIZE_5_MM)).toBe(151)
    expect(dustCountOf(SIZE_1_MM)).toBe(63)
    expect(dustCountOf(SIZE_5_MM)).toBe(201)
    expect(debrisCountOf(SIZE_1_MM)).toBe(16)
    expect(debrisCountOf(SIZE_5_MM)).toBe(50)
  })

  it('never asks a pool for more than it holds, even at the R24 cap', () => {
    expect(fireCountOf(SIZE_10_MM)).toBe(SPARK_CAPACITY)
    expect(dustCountOf(SIZE_10_MM)).toBe(COLLAPSE_DUST_CAPACITY)
    expect(debrisCountOf(SIZE_10_MM)).toBe(BLAST_DEBRIS_CAPACITY)
    for (const radiusMm of [SIZE_1_MM, SIZE_5_MM, SIZE_10_MM, 100000]) {
      expect(fireCountOf(radiusMm)).toBeLessThanOrEqual(SPARK_CAPACITY)
      expect(dustCountOf(radiusMm)).toBeLessThanOrEqual(COLLAPSE_DUST_CAPACITY)
      expect(debrisCountOf(radiusMm)).toBeLessThanOrEqual(BLAST_DEBRIS_CAPACITY)
    }
  })

  it('flashes for two frames over the whole clearing', () => {
    const look = blastFrontLookOf(SIZE_10_MM)
    expect(look.flash).toEqual({ frames: FLASH_FRAMES, radiusM: 24 })
    expect(FLASH_FRAMES).toBe(2)
  })

  it('gathers the front look from the one radius', () => {
    expect(blastFrontLookOf(SIZE_5_MM)).toEqual({
      ring: { radiusM: 8, widthM: blastRingOf(SIZE_5_MM).widthM },
      fireCount: 151,
      dustCount: 201,
      debrisCount: 50,
      flash: { frames: 2, radiusM: 8 },
    })
  })
})

function sprayOfWholeBlast(radiusMm: number): FrontSpray {
  return solidRockSlicesOf(radiusMm)
    .map(([rInnerMm, rOuterMm]) => frontSprayOf(rInnerMm, rOuterMm))
    .reduce((sum, spray) => ({
      fire: sum.fire + spray.fire,
      dust: sum.dust + spray.dust,
      debris: sum.debris + spray.debris,
    }))
}

describe('blast front spray', () => {
  it("throws a one-slice blast's whole rim on its one slice", () => {
    expect(solidRockSlicesOf(SIZE_1_MM)).toHaveLength(1)
    const [[rInnerMm, rOuterMm]] = solidRockSlicesOf(SIZE_1_MM)
    expect(frontSprayOf(rInnerMm, rOuterMm)).toEqual({
      fire: fireCountOf(rOuterMm),
      dust: dustCountOf(rOuterMm),
      debris: debrisCountOf(rOuterMm),
    })
  })

  it('throws a slice only the rim it uncovered, nothing for a ring it stands still on', () => {
    expect(frontSprayOf(8000, 8000)).toEqual({ fire: 0, dust: 0, debris: 0 })
    expect(frontSprayOf(4000, 8000).fire).toBe(fireCountOf(8000) - fireCountOf(4000))
  })

  it('never asks the pools for more than they hold over a whole R24 blast of 29 slices', () => {
    expect(solidRockSlicesOf(SIZE_10_MM)).toHaveLength(29)
    const spray = sprayOfWholeBlast(SIZE_10_MM)
    expect(spray.fire).toBeLessThanOrEqual(SPARK_CAPACITY)
    expect(spray.dust).toBeLessThanOrEqual(COLLAPSE_DUST_CAPACITY)
    expect(spray.debris).toBeLessThanOrEqual(BLAST_DEBRIS_CAPACITY)
    expect(spray.debris).toBeGreaterThan(debrisCountOf(SIZE_5_MM))
  })
})

describe('blast flash sprite', () => {
  it('shows no flash for the shipped size, as it never flashed', () => {
    expect(flashSpriteOf(1, SIZE_1_MM).opacity).toBe(0)
  })

  it('flashes harder with size, for two frames over the clearing', () => {
    expect(flashSpriteOf(5, SIZE_5_MM)).toEqual({
      frames: FLASH_FRAMES,
      radiusM: 8,
      opacity: FLASH_SPRITE_MAX_OPACITY / 2,
    })
    expect(flashSpriteOf(10, SIZE_10_MM).opacity).toBe(FLASH_SPRITE_MAX_OPACITY)
  })
})

describe('blast front layer draw', () => {
  it('draws a call per pool holding any piece, and the flash sprite while it shows', () => {
    expect(frontLayerDrawOf({ fire: 0, dust: 0, debris: 0, isFlashShown: false })).toEqual({
      drawCalls: 0,
      instances: 0,
    })
    expect(frontLayerDrawOf({ fire: 40, dust: 0, debris: 12, isFlashShown: true })).toEqual({
      drawCalls: 3,
      instances: 53,
    })
  })

  it('keeps the highest draw seen', () => {
    const peak = { drawCalls: 2, instances: 300 }
    raisePeak(peak, { drawCalls: 4, instances: 100 })
    expect(peak).toEqual({ drawCalls: 4, instances: 300 })
  })
})
