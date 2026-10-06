/**
 * Read-only debug actions (docs/standards/feature-slices.md 3.14), so the e2e specs and the
 * review sheets can ask the slice what a family looks like at a tier without drawing it:
 * `steampunkDebug.features['ore-visuals'].lookOf('crystal', 12)`.
 */
import type { DebugAction } from '../../debug/debugActionRegistry'
import { oreAtlasCellOf, oreAtlasCellsOf } from './systems/oreAtlasLayout'
import { ORE_LOOKS, oreAtlasCellCountOf, oreFamilyLookOf } from './systems/oreFamilyLooks'
import {
  oreGradeChannelsOf,
  oreHitParticlesOf,
  oreStrengthOf,
  visualEchoOf,
} from './systems/oreGradeChannels'
import { oreLookOfType, oreVariantOf } from './systems/render/oreLookProvider'
import { oreGradeOf } from '../../systems/render/oreGrade'

function describe() {
  return {
    ok: true as const,
    sliceId: 'ore-visuals',
    families: ORE_LOOKS.families.map((family) => family.id),
    atlasCells: oreAtlasCellCountOf(ORE_LOOKS),
    atlas: ORE_LOOKS.atlas,
  }
}

function lookOf(familyId: unknown, tier: unknown) {
  const family = oreFamilyLookOf(ORE_LOOKS, String(familyId))
  if (family === null || !Number.isInteger(tier) || (tier as number) < 1) {
    return { ok: false as const, problems: ['lookOf takes a family id and a tier from 1'] }
  }
  const grade = oreGradeOf(tier as number)
  const variant = oreVariantOf(family, tier as number)
  return {
    ok: true as const,
    ...oreLookOfType(family.id, tier as number),
    grade,
    channels: oreGradeChannelsOf(grade),
    strength: oreStrengthOf(tier as number),
    variant,
    hitParticles: oreHitParticlesOf(grade),
    echo: visualEchoOf(tier as number),
    atlasCell: oreAtlasCellOf(ORE_LOOKS, family.id, variant, grade),
  }
}

function atlasCells() {
  return { ok: true as const, cells: oreAtlasCellsOf(ORE_LOOKS) }
}

export const oreVisualsDebugActions: Readonly<Record<string, DebugAction>> = {
  describe,
  lookOf,
  atlasCells,
}
