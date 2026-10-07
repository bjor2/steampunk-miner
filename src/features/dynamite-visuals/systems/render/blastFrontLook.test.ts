import { describe, expect, it } from 'vitest'
import { COLLAPSE_DUST_CAPACITY, SPARK_CAPACITY } from '../../../../constants/scene'
import {
  blastFrontLookOf,
  blastRingOf,
  debrisCountOf,
  dustCountOf,
  fireCountOf,
  rimTilesOf,
} from './blastFrontLook'
import { BLAST_DEBRIS_CAPACITY, FLASH_FRAMES } from './blastLookConstants'

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
