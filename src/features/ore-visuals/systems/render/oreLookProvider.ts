/**
 * The `ore-visuals` look of an ore cell (feature-slices.md 3.9): family and grade come from the
 * ores index (`oreTypeOf`); until the ores slice registers a catalogue the kernel default names
 * only `metal` and `crystal` with grade 0, and the grade then comes from the `oreGrades`
 * thresholds. The variant is #140's `(t - 1) mod 4`, read here until the ores index carries it.
 * The answer is today's `OreLook`, so the kernel shader can draw it; the atlas renderer (a kernel
 * follow-up) will read the family, grade and variant through `oreAtlasCellOf` instead.
 */
import { oreTier } from '../../../../systems/economy/oreEconomy'
import { oreTypeOf } from '../../../../systems/registries/oreTypes'
import { oreGradeOf } from '../../../../systems/render/oreGrade'
import type { OreLook } from '../../../../systems/render/oreLook'
import type { PlanetParams } from '../../../../systems/world/planetParams'
import { familyOfCell, tierOffsetOfCell } from '../../../../systems/world/worldCell'
import { ORE_LOOKS, oreFamilyLookOf, type OreFamilyLook, type OreLooks } from '../oreFamilyLooks'
import { oreGlowOf, oreSparklesOf } from '../oreGradeChannels'
import { oreBodyColourOf } from './oreColour'

const BAND_ONE = 1
const NO_CATALOGUE_GRADE = 0

/** The look of an ore cell on this planet: the planet's band-1 tier plus the cell's offset. */
export function oreLookOfCell(params: PlanetParams, cell: number): OreLook {
  const tier = oreTier(params.planetIndex, BAND_ONE) + tierOffsetOfCell(cell)
  const type = oreTypeOf({ tier, cellFamily: familyOfCell(cell) })
  return oreLookOfType(type.family, tier, type.grade)
}

/** The look of a catalogue family at a tier; a family with no row wears the first row. */
export function oreLookOfType(
  familyId: string,
  tier: number,
  catalogueGrade = NO_CATALOGUE_GRADE,
  looks: OreLooks = ORE_LOOKS,
): OreLook {
  const family = familyRowOf(looks, familyId)
  const grade = catalogueGrade > NO_CATALOGUE_GRADE ? catalogueGrade : oreGradeOf(tier)
  return {
    silhouette: family.shaderSilhouette,
    colour: oreBodyColourOf(family, oreVariantOf(family, tier), tier),
    glow: oreGlowOf(tier, grade, looks),
    sparkles: oreSparklesOf(grade, looks),
  }
}

/** #140 "Ore identity": two neighbouring tiers of one family never share a variant. */
export function oreVariantOf(family: OreFamilyLook, tier: number): number {
  return (tier - 1) % family.variants
}

function familyRowOf(looks: OreLooks, familyId: string): OreFamilyLook {
  return oreFamilyLookOf(looks, familyId) ?? looks.families[0]
}
