/**
 * Read-only debug actions (feature-slices.md 3.14), so e2e specs and balance probes can ask the
 * catalogue for a type and the lead weights without mining one:
 * `steampunkDebug.features.ores.typeOf('crystal', 12)`.
 */
import type { DebugAction } from '../../debug/debugActionRegistry'
import { leadWeights, oreFamilies, oreTypeOf } from './systems/oreCatalogue'

const BANDS = [1, 2, 3, 4, 5]

function describe() {
  return {
    ok: true as const,
    sliceId: 'ores',
    families: oreFamilies().map((family) => family.id),
    leadWeightsBpByBand: BANDS.map((band) => leadWeights(band)),
  }
}

function typeOf(familyId: unknown, tier: unknown) {
  const isFamily = oreFamilies().some((family) => family.id === familyId)
  if (!isFamily || !Number.isSafeInteger(tier) || (tier as number) < 1) {
    return { ok: false as const, problems: ['typeOf takes a family id and a tier from 1'] }
  }
  return { ok: true as const, ...oreTypeOf(String(familyId), tier as number) }
}

export const oresDebugActions: Readonly<Record<string, DebugAction>> = { describe, typeOf }
