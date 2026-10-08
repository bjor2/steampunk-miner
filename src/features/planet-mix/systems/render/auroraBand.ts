/**
 * The magnetic planet's aurora (GD lock on spec #258 Q1 "On screen": a thin blue aurora band
 * along the surface horizon), provided to the kernel's planet sky band (GD ruling on #293 Q1): the
 * look of `magneticLooks.json` with the ribbon art, on exactly the planets of the magnetic class,
 * so endless Lodestone planets wear it and P30's relic planet does not.
 */
import type {
  PlanetSkyBandLook,
  PlanetSkyBandProvider,
} from '../../../../systems/registries/planetSkyBand'
import type { PlanetParams } from '../../../../systems/world/planetParams'
import { isMagneticPlanet } from '../planetClass'
import { AURORA_RIBBON_PART_ID, MAGNETIC_FIELD_ASSET_ID } from './magneticArt'
import { MAGNETIC_LOOKS } from './magneticLooks'

export const MAGNETIC_AURORA: PlanetSkyBandLook = {
  ...MAGNETIC_LOOKS.aurora,
  ribbon: { assetId: MAGNETIC_FIELD_ASSET_ID, partId: AURORA_RIBBON_PART_ID },
}

/** The aurora on a magnetic planet; no band anywhere else. */
export function magneticAuroraOf(params: PlanetParams): PlanetSkyBandLook | null {
  return isMagneticPlanet(params.planetIndex) ? MAGNETIC_AURORA : null
}

export const MAGNETIC_SKY_BAND: PlanetSkyBandProvider = {
  id: 'planet-mix.aurora',
  bandOf: magneticAuroraOf,
}
