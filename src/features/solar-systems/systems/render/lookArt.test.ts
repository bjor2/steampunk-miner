import { describe, expect, it } from 'vitest'
import { blenderAssetIds, categoryOfAssetId, isKebabId } from '../../../../systems/art/artIds'
import { lumaOf, rgbOfHex } from '../../../../systems/render/colour'
import lookArtFile from '../../lookArt.json'
import { ARCHETYPE_PALETTE } from '../paletteRows'
import {
  lookArtOf,
  lookIdOfTileAsset,
  lookPreviewArtAssets,
  lookTileArtAssets,
  lookTileAssetIdOf,
  LOOK_ART,
} from './lookArt'
import {
  areColoursApart,
  brightestArchetypeRockLuma,
  lookArtProblems,
  MIN_LOOK_DISTANCE_CHANNELS,
} from './lookArtGuards'

// The art rows of the eight SS2 looks (ticket 778): one per palette look, in a planet row look's
// shape under ticket 653's guards, and the tile each look's motif ships as.

type Raw = Record<string, unknown>

const LOOK_IDS = ARCHETYPE_PALETTE.looks.map((look) => look.id)
const FIRST = LOOK_IDS[0]

function problemsWith(change: Raw): string[] {
  return lookArtProblems({ ...lookArtFile.looks, ...change }, LOOK_IDS)
}

function rowWith(lookId: string, change: Raw): Raw {
  const rows = lookArtFile.looks as Record<string, Raw>
  return { [lookId]: { ...rows[lookId], ...change } }
}

describe('SS2 look art rows', () => {
  it('ships one row per palette look with no problem', () => {
    expect(lookArtProblems(lookArtFile.looks, LOOK_IDS)).toEqual([])
    expect(LOOK_ART.map((art) => art.lookId)).toEqual(LOOK_IDS)
  })

  it('names each tile from its look under the ground category, registered for the export', () => {
    for (const art of LOOK_ART) {
      expect(art.tileAssetId).toBe(`ground-look-${art.lookId}`)
      expect(isKebabId(art.tileAssetId)).toBe(true)
      expect(categoryOfAssetId(art.tileAssetId)).toBe('ground')
      expect(blenderAssetIds()).toContain(art.tileAssetId)
      expect(lookIdOfTileAsset(art.tileAssetId)).toBe(art.lookId)
    }
    expect(lookTileArtAssets()).toEqual(
      LOOK_IDS.map((lookId) => ({ id: lookTileAssetIdOf(lookId), category: 'ground' })),
    )
    expect(lookIdOfTileAsset('ground-band-1')).toBeNull()
  })

  it('names each look’s star map preview under the ui category with its orbit dot (ticket 795)', () => {
    for (const art of LOOK_ART) {
      expect(art.previewAssetId).toBe(`ui-star-map-planet-${art.lookId}`)
      expect(categoryOfAssetId(art.previewAssetId)).toBe('ui')
      expect(blenderAssetIds()).toContain(art.previewAssetId)
    }
    expect(lookPreviewArtAssets()).toEqual(
      LOOK_IDS.map((lookId) => ({
        id: `ui-star-map-planet-${lookId}`,
        category: 'ui',
        parts: [`ui-star-map-planet-${lookId}-dot`],
      })),
    )
  })

  it('answers a look its art and nothing for a look the palette lacks', () => {
    expect(lookArtOf('rime-shelf')).toMatchObject({
      lookId: 'rime-shelf',
      tileAssetId: 'ground-look-rime-shelf',
      look: { rockSurface: '#4a7484', skyBand: { ribbon: null } },
    })
    expect(lookArtOf('rime-shelf')?.look.skyBand.ribbon).toBeNull()
    expect(lookArtOf('no-such-look')).toBeNull()
  })

  it('keeps every rock no brighter than the brightest archetype host rock', () => {
    const ceiling = brightestArchetypeRockLuma()
    for (const art of LOOK_ART) {
      expect(lumaOf(rgbOfHex(art.look.rockSurface))).toBeLessThanOrEqual(ceiling)
      expect(lumaOf(rgbOfHex(art.look.rockDeep))).toBeLessThanOrEqual(ceiling)
    }
  })

  it('keeps every pair of looks at least 32 channel steps apart in rock, horizon and band', () => {
    for (const [at, first] of LOOK_ART.entries()) {
      for (const second of LOOK_ART.slice(at + 1)) {
        expect(
          areColoursApart(rgbOfHex(first.look.rockSurface), rgbOfHex(second.look.rockSurface)),
        ).toBe(true)
        expect(areColoursApart(rgbOfHex(first.look.horizon), rgbOfHex(second.look.horizon))).toBe(
          true,
        )
        expect(
          areColoursApart(
            rgbOfHex(first.look.skyBand.colour),
            rgbOfHex(second.look.skyBand.colour),
          ),
        ).toBe(true)
      }
    }
    expect(MIN_LOOK_DISTANCE_CHANNELS).toBe(32)
  })

  it('refuses a look with no row and a row for no look', () => {
    const rest = Object.fromEntries(
      Object.entries(lookArtFile.looks).filter(([lookId]) => lookId !== FIRST),
    )
    expect(lookArtProblems(rest, LOOK_IDS)).toEqual([`looks.${FIRST} has no art row`])
    const stray = {
      rockSurface: '#102030',
      rockDeep: '#000000',
      horizon: '#ffffff',
      skyBand: { colour: '#000000', heightM: 0, thicknessM: 1, flicker: 0 },
    }
    expect(problemsWith({ 'lava-sea': stray })).toEqual([
      'looks.lava-sea is no look of the palette',
    ])
  })

  it('refuses a colour that is not #rrggbb, a bright rock, a stray field and a band out of bounds', () => {
    expect(problemsWith(rowWith(FIRST, { rockSurface: 'orange' }))).toEqual([
      `looks.${FIRST}.rockSurface must be a #rrggbb colour`,
    ])
    expect(problemsWith(rowWith(FIRST, { rockDeep: '#ffffff' }))).toEqual([
      `looks.${FIRST}.rockDeep is brighter than the host rock's ${brightestArchetypeRockLuma().toFixed(3)}`,
    ])
    expect(problemsWith(rowWith(FIRST, { glow: 1 }))).toEqual([
      `looks.${FIRST}.glow is not a look field`,
    ])
    const band = (lookArtFile.looks[FIRST as 'ash-plain'] as Raw).skyBand as Raw
    expect(problemsWith(rowWith(FIRST, { skyBand: { ...band, thicknessM: 40 } }))).toEqual([
      `looks.${FIRST}.skyBand.thicknessM must be metres from 0.25 to 10`,
    ])
    expect(problemsWith(rowWith(FIRST, { skyBand: { ...band, flicker: 2 } }))).toEqual([
      `looks.${FIRST}.skyBand.flicker must be from 0 to 1`,
    ])
  })

  it('refuses two looks whose rock surfaces lie under 32 channel steps apart', () => {
    const twin = (lookArtFile.looks as Record<string, Raw>)['ash-plain'].rockSurface
    expect(problemsWith(rowWith('lode-banded', { rockSurface: twin }))).toEqual([
      'looks: ash-plain and lode-banded share a look: their rockSurface lie under 32 apart',
    ])
  })
})
