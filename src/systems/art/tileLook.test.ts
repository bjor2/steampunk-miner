import { describe, expect, it } from 'vitest'
import { groundStrataMapsOf, tileMapsOf } from './tileLook'

describe('tile look', () => {
  it('draws a final ground band from its exported albedo and normal maps', () => {
    expect(tileMapsOf('ground-band-3')).toEqual({
      albedo: 'assets/ground/ground-band-3/ground-band-3.albedo.ktx2',
      normal: 'assets/ground/ground-band-3/ground-band-3.normal.ktx2',
    })
  })

  it('draws a final casing grade from its exported maps', () => {
    expect(tileMapsOf('casing-grade-5')?.albedo).toBe(
      'assets/casing/casing-grade-5/casing-grade-5.albedo.ktx2',
    )
  })

  it('has no tile maps for a parts asset or an unknown id', () => {
    expect(tileMapsOf('vehicle')).toBeNull()
    expect(tileMapsOf('ground-band-9')).toBeNull()
  })

  it('lists the five ground strata in band order', () => {
    const strata = groundStrataMapsOf()
    expect(strata?.map((maps) => maps.albedo.split('/')[2])).toEqual([
      'ground-band-1',
      'ground-band-2',
      'ground-band-3',
      'ground-band-4',
      'ground-band-5',
    ])
  })
})
