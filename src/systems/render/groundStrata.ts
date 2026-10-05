/**
 * How the ground strata maps (#51, #52, S7d) lie on a round planet. A band's texture wraps around
 * the planet in rings, so its layers run along the surface wherever the camera rolls (#13): `u`
 * follows the angle, `v` the radius. Each band fits a whole number of 4 m tiles around its middle
 * radius, so the texture closes on itself with no seam; the density is 256 px/m there (#38) and
 * drifts a little toward the band's inner and outer edges. Bands change texture at their edges
 * anyway, so the turn count may change there too.
 *
 * The maps are authored at planet 1's band colours (scripts/art/author_tiles.py); another planet
 * tints them by the ratio of its band colour to planet 1's (#51 "planet 2 tints them").
 */
import { ART_RULES } from '../art/artIds'
import { BAND_COUNT } from '../world/planetGeometry'
import type { PlanetParams } from '../world/planetParams'
import { bandColourOf, paletteOf } from './bandPalette'
import type { Rgb } from './colour'

/** One strata tile's side in metres: 1024 px at 256 px/m (#52). */
export const STRATA_TILE_M = ART_RULES.tilePx / ART_RULES.pxPerMetre.ground

/** The palette the strata maps were authored in. */
export const STRATA_AUTHORED_PALETTE_ID = 'palette.planet_1'

const BANDS = Array.from({ length: BAND_COUNT }, (_, at) => at + 1)

/** Whole strata tiles around each band's middle radius, bands 1 to 5. */
export function strataTurnsOf(params: PlanetParams): number[] {
  return BANDS.map((band) => turnsAround(middleRadiusOfBand(params, band)))
}

/** Per channel, the planet's band colour over planet 1's: all ones on planet 1. */
export function strataTintsOf(paletteId: string): Rgb[] {
  const palette = paletteOf(paletteId)
  const authored = paletteOf(STRATA_AUTHORED_PALETTE_ID)
  return BANDS.map((band) => ratioOf(bandColourOf(palette, band), bandColourOf(authored, band)))
}

function middleRadiusOfBand(params: PlanetParams, band: number): number {
  return (outerRadiusOfBand(params, band) + outerRadiusOfBand(params, band + 1)) / 2
}

/** Band 1 starts at the surface; past band 5 is the core. */
function outerRadiusOfBand(params: PlanetParams, band: number): number {
  if (band === 1) return params.radiusTiles
  if (band > BAND_COUNT) return params.coreRadiusTiles
  return Math.sqrt(params.bandStartsHalfTileSq[band - 2]) / 2
}

function turnsAround(radius: number): number {
  return Math.max(1, Math.round((2 * Math.PI * radius) / STRATA_TILE_M))
}

function ratioOf(colour: Rgb, authored: Rgb): Rgb {
  return [colour[0] / authored[0], colour[1] / authored[1], colour[2] / authored[2]]
}
