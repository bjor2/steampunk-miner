/**
 * Which ores are a planet's signature (#141 "Signature", #232 tag fold): the signature type of
 * planet `p` is `<actOf(p).signature>_t<t_5>`, with `t_5 = 3(p-1) + 5`, from the first mixed planet.
 * The flag is a pure function of an ore's family and tier, because tier `t_5` turns up only on
 * planet `p` (bands 4-5, and band 3's +2) and on `p + 1` (bands 1-2), and every one of those cells
 * wears a common of its act, never the signature family (checked for p = 3..200 in the spec).
 * Horizontal: which ore is the prize; its +1 sale tier is the kernel's (`saleTier`).
 */
import type { OreSignatureTag, OreType } from '../../../systems/registries/oreTypes'
import { oreTierOf } from '../../ores'
import { actOf } from './planetActs'
import { THEME_ROWS, type ThemeRows } from './themeRows'

export const PLANET_MIX_SIGNATURE_TAG_ID = 'planet-mix.signature'

/** Band 5's tier lead 0: the tier a signature ore has. */
const SIGNATURE_BAND = 5
const TIERS_PER_PLANET = 3

export const planetMixSignatureTag: OreSignatureTag = {
  id: PLANET_MIX_SIGNATURE_TAG_ID,
  isSignature: ({ family, tier }: OreType) => isSignatureOre(family, tier),
}

/** Whether `<family>_t<tier>` is the signature of the planet whose band 5 has that tier. */
export function isSignatureOre(
  family: string,
  tier: number,
  rows: ThemeRows = THEME_ROWS,
): boolean {
  const planetIndex = planetOfBandFiveTier(tier)
  if (planetIndex === null || planetIndex < rows.mixFromPlanet) return false
  return actOf(planetIndex, rows).signature === family
}

/** The planet whose band-5 tier is `tier`, or null when no planet's is. */
function planetOfBandFiveTier(tier: number): number | null {
  const sinceFirst = tier - oreTierOf(1, SIGNATURE_BAND, 0)
  if (sinceFirst < 0 || sinceFirst % TIERS_PER_PLANET !== 0) return null
  return sinceFirst / TIERS_PER_PLANET + 1
}
