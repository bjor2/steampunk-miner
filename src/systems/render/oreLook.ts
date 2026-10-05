/**
 * How an ore tile looks (#13 Visual direction): the family sets the silhouette, the tier sets the
 * colour ramp, glow strength and sparkle count, all from one formula, so any tier has a look with
 * no per-tier art (design.md section 6, principle 37.1). Tier is ranked as `t / (t + k)`, which
 * rises strictly for every tier, so luma, and with it a greyscale screenshot, always ranks two
 * tiers correctly without colour (#13 acceptance).
 */
import { oreTier } from '../economy/oreEconomy'
import type { PlanetParams } from '../world/planetParams'
import { familyOfCell, RESOURCE_FAMILY, tierOffsetOfCell } from '../world/worldCell'
import { ART_DIRECTION, type OreFamilyLook, type OreSilhouette } from './artDirection'
import { withLuma, type Rgb } from './colour'

export interface OreLook {
  silhouette: OreSilhouette
  colour: Rgb
  /** Emissive strength, 0 to `glowMax`. */
  glow: number
  sparkles: number
}

export type OreFamilyName = keyof typeof ART_DIRECTION.oreFamilies

const BAND_ONE = 1

/** In (0, 1), strictly rising with tier. */
export function oreRankOf(tier: number): number {
  return tier / (tier + ART_DIRECTION.oreRamp.halfRankTier)
}

export function oreLookOf(family: OreFamilyName, tier: number): OreLook {
  const { lumaMin, lumaMax, glowMax, sparklesMax } = ART_DIRECTION.oreRamp
  const look: OreFamilyLook = ART_DIRECTION.oreFamilies[family]
  const rank = oreRankOf(tier)
  return {
    silhouette: look.silhouette,
    colour: withLuma(look.hue, lumaMin + (lumaMax - lumaMin) * rank),
    glow: glowMax * rank,
    sparkles: Math.floor(sparklesMax * rank),
  }
}

/** The look of an ore cell on this planet; tier is the planet's band-1 tier plus the offset. */
export function oreLookOfCell(params: PlanetParams, cell: number): OreLook {
  const tier = oreTier(params.planetIndex, BAND_ONE) + tierOffsetOfCell(cell)
  return oreLookOf(familyNameOf(cell), tier)
}

function familyNameOf(cell: number): OreFamilyName {
  return familyOfCell(cell) === RESOURCE_FAMILY.crystal ? 'crystal' : 'metal'
}
