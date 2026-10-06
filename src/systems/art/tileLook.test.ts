import { describe, expect, it } from 'vitest'
import { artCatalogueOf } from './artCatalogue'
import { groundStrataMapsOf, tileEmissiveMapOf, tileMapsOf } from './tileLook'
import { SHIPPED_ART } from '../../scene/shippedArt'

describe('tile look', () => {
  it('draws a final ground band from its exported albedo and normal maps', () => {
    expect(tileMapsOf(SHIPPED_ART, 'ground-band-3')).toEqual({
      albedo: 'assets/ground/ground-band-3/ground-band-3.albedo.ktx2',
      normal: 'assets/ground/ground-band-3/ground-band-3.normal.ktx2',
    })
  })

  it('draws a final casing grade from its exported maps', () => {
    expect(tileMapsOf(SHIPPED_ART, 'casing-grade-5')?.albedo).toBe(
      'assets/casing/casing-grade-5/casing-grade-5.albedo.ktx2',
    )
  })

  it('has no tile maps for a parts asset or an unknown id', () => {
    expect(tileMapsOf(SHIPPED_ART, 'vehicle')).toBeNull()
    expect(tileMapsOf(SHIPPED_ART, 'ground-band-9')).toBeNull()
  })

  it('has an emissive map only for a final tile that glows', () => {
    const glowing = artCatalogueOf(
      [{ id: 'casing-grade-4', source: 'blender', form: 'tile', status: 'final', emissive: true }],
      [],
      [],
    )
    expect(tileEmissiveMapOf(glowing, 'casing-grade-4')).toBe(
      'assets/casing/casing-grade-4/casing-grade-4.emissive.ktx2',
    )
    expect(tileEmissiveMapOf(SHIPPED_ART, 'casing-grade-4')).toBeNull()
  })

  it('lists the five ground strata in band order', () => {
    const strata = groundStrataMapsOf(SHIPPED_ART)
    expect(strata?.map((maps) => maps.albedo.split('/')[2])).toEqual([
      'ground-band-1',
      'ground-band-2',
      'ground-band-3',
      'ground-band-4',
      'ground-band-5',
    ])
  })
})
