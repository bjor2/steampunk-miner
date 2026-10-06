import { describe, expect, it } from 'vitest'
import {
  blenderAssetIds,
  HEAT_LAVA_ROW_ID,
  REFRACTORY_LINING_ROW_ID,
  refractoryCasingTileIds,
  vectorIconIds,
} from './artIds'
import { manifestEntryOf } from './artCatalogue'
import { heatTileMapsOf, tileEmissiveMapOf, tileMapsOf } from './tileLook'
import { SHIPPED_ART } from '../../scene/shippedArt'
import { bandColourOf, paletteOf } from '../render/bandPalette'
import { LOCKED_SCHEDULE } from '../unlocks/unlockSchedule'

// The heat_lava + refractory_lining art (#113 "Visibility", #114): the lava tile, the refractory
// lining tiles, the heat gauge and lining type icons, and the heat planets' palette.
describe('heat and lava art', () => {
  it('names the art from its two locked schedule rows (#114)', () => {
    expect(LOCKED_SCHEDULE.rows.map((row) => row.id)).toEqual(
      expect.arrayContaining([HEAT_LAVA_ROW_ID, REFRACTORY_LINING_ROW_ID]),
    )
    expect(blenderAssetIds()).toEqual(
      expect.arrayContaining(['ground-heat-lava', 'casing-refractory-grade-1']),
    )
    expect(vectorIconIds()).toEqual(
      expect.arrayContaining(['icon-heat-lava', 'icon-refractory-lining']),
    )
  })

  it('gives the refractory lining one tile per casing grade, so grade still reads on it', () => {
    expect(refractoryCasingTileIds()).toEqual([
      'casing-refractory-grade-1',
      'casing-refractory-grade-2',
      'casing-refractory-grade-3',
      'casing-refractory-grade-4',
      'casing-refractory-grade-5',
    ])
  })

  it('makes the lava and every refractory tile glow, and no standard casing tile', () => {
    const glowing = ['ground-heat-lava', ...refractoryCasingTileIds()]
    expect(glowing.filter((id) => manifestEntryOf(SHIPPED_ART, id)?.emissive !== true)).toEqual([])
    expect(manifestEntryOf(SHIPPED_ART, 'casing-grade-3')?.emissive).toBeUndefined()
  })

  it('ships the lava and refractory tiles as final art with their glow maps', () => {
    const tiles = ['ground-heat-lava', ...refractoryCasingTileIds()]
    expect(tiles.filter((id) => tileMapsOf(SHIPPED_ART, id) === null)).toEqual([])
    expect(tileEmissiveMapOf(SHIPPED_ART, 'ground-heat-lava')).toBe(
      'assets/ground/ground-heat-lava/ground-heat-lava.emissive.ktx2',
    )
  })

  it('draws heat planets in a palette of their own that runs hot in every band', () => {
    const heat = paletteOf('palette.heat')
    const bands = [1, 2, 3, 4, 5].map((band) => bandColourOf(heat, band))
    expect(bands.filter(([red, green]) => red <= green)).toEqual([])
    expect(heat.core).not.toEqual(paletteOf('palette.planet_1').core)
  })
})

describe('heat tiles the terrain draws (#96)', () => {
  it('draws the shipped lava tile and the first refractory grade, each with its glow', () => {
    expect(heatTileMapsOf(SHIPPED_ART)).toEqual({
      lava: tileMapsOf(SHIPPED_ART, 'ground-heat-lava'),
      lavaEmissive: tileEmissiveMapOf(SHIPPED_ART, 'ground-heat-lava'),
      refractory: tileMapsOf(SHIPPED_ART, 'casing-refractory-grade-1'),
      refractoryEmissive: tileEmissiveMapOf(SHIPPED_ART, 'casing-refractory-grade-1'),
    })
  })
})
