import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { paletteOf, shownPaletteOf } from '../render/bandPalette'
import { buildChunkTileBatch, type ChunkTileBatch } from '../render/chunkTileBatch'
import { rgbOfHex } from '../render/colour'
import { chunkDensityHaloOf } from '../render/densityHalo'
import { planetParamsFor, type PlanetParams } from '../world/planetParams'
import { currentDensityOfChunk, EMPTY_WORLD, materialCellsOfChunk } from '../world/worldState'
import { planetLookOf, type PlanetLook } from './planetLooks'
import { planetSkyBandOf, type PlanetSkyBandLook } from './planetSkyBand'

const PLANET_1 = planetParamsFor(83921, 1)
const PLANET_3 = planetParamsFor(83921, 3)

const DUST_BAND: PlanetSkyBandLook = {
  colour: '#a89880',
  heightM: 1,
  thicknessM: 3,
  flicker: 0,
  ribbon: null,
}

const COAL_LOOK: PlanetLook = {
  rockSurface: '#4e4a3e',
  rockDeep: '#1f1c1a',
  horizon: '#7d8a5c',
  skyBand: DUST_BAND,
}

/** A slice whose rows give planet `planet` the coal look and no other planet any. */
function lookSliceFor(planet: number): SliceDefinition {
  return {
    id: 'fake',
    register(r) {
      r.planetLook({ id: 'fake.look', lookOf: (index) => (index === planet ? COAL_LOOK : null) })
    },
  }
}

const AURORA: PlanetSkyBandLook = { ...DUST_BAND, colour: '#5fb4ff', heightM: 2 }

const CLASS_BAND_SLICE: SliceDefinition = {
  id: 'fake-class',
  register(r) {
    r.planetSkyBand({ id: 'fake-class.band', bandOf: () => AURORA })
  },
}

function batchOnSurfaceOf(params: PlanetParams): ChunkTileBatch {
  const [cx, cy] = [0, 9]
  const cells = materialCellsOfChunk(EMPTY_WORLD, params, cx, cy)
  const halo = chunkDensityHaloOf(
    (x, y) => currentDensityOfChunk(EMPTY_WORLD, params, x, y),
    cx,
    cy,
  )
  return buildChunkTileBatch(params, cx, cy, cells, halo)
}

describe('planet looks', () => {
  it('gives no planet a look with no provider', () => {
    expect(withRegistrations([], () => planetLookOf(3))).toBeNull()
  })

  it('answers the look the provider gives the planet, and none elsewhere', () => {
    withRegistrations([lookSliceFor(3)], () => {
      expect(planetLookOf(3)).toEqual(COAL_LOOK)
      expect(planetLookOf(4)).toBeNull()
    })
  })

  it('draws a planet with no look in its archetype palette', () => {
    const shown = withRegistrations([], () => shownPaletteOf(PLANET_3))
    expect(shown).toEqual(paletteOf(PLANET_3.paletteId))
  })

  it('takes the rock and the horizon from the look and keeps the archetype pad, core and underground', () => {
    const shown = withRegistrations([lookSliceFor(3)], () => shownPaletteOf(PLANET_3))
    const archetype = paletteOf(PLANET_3.paletteId)
    expect(shown).toEqual({
      ...archetype,
      surface: rgbOfHex(COAL_LOOK.rockSurface),
      deep: rgbOfHex(COAL_LOOK.rockDeep),
      sky: rgbOfHex(COAL_LOOK.horizon),
    })
  })

  it('lights the look’s band where the planet class has none', () => {
    expect(withRegistrations([lookSliceFor(3)], () => planetSkyBandOf(PLANET_3))).toEqual(DUST_BAND)
  })

  it('lets the planet class’s band win over the look’s', () => {
    const band = withRegistrations([lookSliceFor(3), CLASS_BAND_SLICE], () =>
      planetSkyBandOf(PLANET_3),
    )
    expect(band).toEqual(AURORA)
  })

  it('recolours the rock of a chunk and leaves every ore colour as it was', () => {
    const plain = withRegistrations([], () => batchOnSurfaceOf(PLANET_1))
    const looked = withRegistrations([lookSliceFor(1)], () => batchOnSurfaceOf(PLANET_1))
    expect(plain.oreColours.some((channel) => channel > 0)).toBe(true)
    expect(looked.oreColours).toEqual(plain.oreColours)
    expect(looked.baseColours).not.toEqual(plain.baseColours)
  })
})
