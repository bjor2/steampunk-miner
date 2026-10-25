import { describe, expect, it } from 'vitest'
import { SHIPPED_ART } from '../../../scene/shippedArt'
import { manifestEntryOf } from '../../../systems/art/artCatalogue'
import { paletteOf } from '../../../systems/render/bandPalette'
import { hexOfRgb, rgbOfHex } from '../../../systems/render/colour'
import { ORE_ROWS } from '../../ores'
import artFile from '../merchantArt.json'
import {
  MERCHANT_ART,
  merchantArtAssets,
  merchantArtProblems,
  merchantFrontageAssetIdOf,
  merchantFrontageOf,
} from './merchantArt'
import { merchantCanvasColourOf } from './render/merchantLook'
import { PLANET_KITS } from './planetKitRows'

// The merchant frontages (ticket 825): one platform asset per authored merchant on the Assay &
// Exchange, in the planet's own colour, so each planet's identity reads at the merchant as it does
// on its star map card (the GD lock of 24 Oct; #795/#796 read only).

const planet = (place: string) => ({ system: '1', planet: place })
const firstFrontage = artFile.frontages[0]

/** Two colours read apart when they sit at least this far apart in unit RGB. */
const MIN_COLOUR_DISTANCE = 0.12

function colourDistanceOf(a: string, b: string): number {
  const [ar, ag, ab] = rgbOfHex(a)
  const [br, bg, bb] = rgbOfHex(b)
  return Math.hypot(ar - br, ag - bg, ab - bb)
}

describe('merchant art', () => {
  it('reads the frontages file with no problem against the planet kits', () => {
    expect(merchantArtProblems(artFile, PLANET_KITS.merchants)).toEqual([])
  })

  it('gives every first-system merchant one frontage, named by its place', () => {
    expect(MERCHANT_ART.frontages.map((frontage) => frontage.assetId)).toEqual([
      'platform-merchant-1',
      'platform-merchant-2',
      'platform-merchant-3',
      'platform-merchant-4',
      'platform-merchant-5',
    ])
    for (const merchant of PLANET_KITS.merchants) {
      expect(merchantFrontageOf(MERCHANT_ART, merchant.planet)?.assetId).toBe(
        merchantFrontageAssetIdOf(merchant.planet),
      )
    }
  })

  it('authors no frontage for a later system’s planet, which wears a template (#824)', () => {
    expect(merchantFrontageAssetIdOf({ system: '2', planet: '1' })).toBeNull()
    expect(merchantFrontageOf(MERCHANT_ART, { system: '2', planet: '1' })).toBeNull()
  })

  it('registers one platform asset per frontage with the banner as its moving part', () => {
    expect(merchantArtAssets(MERCHANT_ART)).toEqual(
      MERCHANT_ART.frontages.map((frontage) => ({
        id: frontage.assetId,
        category: 'platform',
        parts: ['merchant-banner'],
      })),
    )
  })

  it('refuses a frontage for a planet with no merchant, and one whose asset id drifts', () => {
    const stray = { ...firstFrontage, planet: planet('7'), assetId: 'platform-merchant-7' }
    expect(
      merchantArtProblems(
        { ...artFile, frontages: [...artFile.frontages, stray] },
        PLANET_KITS.merchants,
      ),
    ).toEqual(['frontages[5].planet has no merchant in planetKits.json'])
    const drifted = [
      { ...firstFrontage, assetId: 'platform-merchant-hearthmoor' },
      ...artFile.frontages.slice(1),
    ]
    expect(merchantArtProblems({ ...artFile, frontages: drifted }, PLANET_KITS.merchants)).toEqual([
      'frontages[0].assetId must be "platform-merchant-1"',
    ])
  })

  it('bolts every frontage onto the Sell building at one point of its frame', () => {
    expect(MERCHANT_ART.host).toBe('sell')
    expect(MERCHANT_ART.atM).toEqual([1.05, 3])
    expect(merchantArtProblems({ ...artFile, atM: [1] }, PLANET_KITS.merchants)).toEqual([
      'merchantArt.json atM must be two metres [x, y]',
    ])
  })

  it('refuses a table that leaves a merchant without a frontage', () => {
    expect(
      merchantArtProblems(
        { ...artFile, frontages: artFile.frontages.slice(1) },
        PLANET_KITS.merchants,
      ),
    ).toEqual(['merchant "Hearthmoor Assay" has 0 frontages, not one'])
  })

  it('wears the planet’s horizon colour, the look row the star map card draws; planet 1 its palette sky', () => {
    expect(merchantCanvasColourOf(planet('1'))).toBe(hexOfRgb(paletteOf('palette.planet_1').sky))
    for (const place of ['2', '3', '4', '5']) {
      const row = ORE_ROWS.planets.rows[Number(place) - 1]
      expect(merchantCanvasColourOf(planet(place))).toBe(row.look!.horizon)
    }
  })

  it('paints each frontage’s placeholder and banner in that colour, so the dock and the card agree', () => {
    for (const frontage of MERCHANT_ART.frontages) {
      const entry = manifestEntryOf(SHIPPED_ART, frontage.assetId)!
      const canvas = merchantCanvasColourOf(frontage.planet)
      expect(entry.color, frontage.assetId).toBe(canvas)
      expect(entry.partColors?.[MERCHANT_ART.bannerPartId], frontage.assetId).toBe(canvas)
    }
  })

  it('reads the five merchants apart: distinct devices and colours a hair apart at least', () => {
    const devices = MERCHANT_ART.frontages.map((frontage) => frontage.device)
    expect(new Set(devices).size).toBe(devices.length)
    const colours = MERCHANT_ART.frontages.map((frontage) =>
      merchantCanvasColourOf(frontage.planet),
    )
    for (let a = 0; a < colours.length; a++) {
      for (let b = a + 1; b < colours.length; b++) {
        expect(
          colourDistanceOf(colours[a], colours[b]),
          `${colours[a]} vs ${colours[b]}`,
        ).toBeGreaterThanOrEqual(MIN_COLOUR_DISTANCE)
      }
    }
  })
})
