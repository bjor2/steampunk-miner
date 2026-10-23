/**
 * The roster fold (TD ruling on ticket 446, 6226236698 section 2; Systems' family-first rule,
 * 6226198316, GD option A, 6226210993): each ore patch draws one material kind from its planet's
 * roster, uniform over the kinds live on the patch's own family and rarity tier in its band
 * (`roll % nLive`; the kind's window under the planet's ore rules, ticket 738), and none when no
 * kind is live there. Horizontal: a look layer only.
 *
 * It is a `patchContent` fold sorted after `ores.lead` and `planet-mix.mix`, so it reads the final
 * family and tier, and it writes the kind slot alone: family, tier, ore id, quantity and gate stay as
 * the lattice and the slices painted them. Its roll comes from the hook's own sub-seed, keyed on the
 * patch's band and centre like the lead roll, so it consumes nothing from any other stream and is a
 * pure function of the planet and the patch in any chunk order. Integer only.
 */
import { hashCell } from '../../../systems/cellRandom'
import type { GenerationHook, PatchContent } from '../../../systems/registries/generationHooks'
import type { OrePatch } from '../../../systems/world/orePatches'
import type { PlanetParams } from '../../../systems/world/planetParams'
import { NO_KIND_SLOT } from '../../../systems/world/worldCell'
import { familyOfCellCode, isSlotLiveInBand, rarityTiers, type KindSlot } from '../../ores'
import { planetRosterOf } from './planetRoster'
import { rareClusterKindsOf } from './rosterClusterKinds'

export const ROSTER_HOOK_ID = 'roster.materials'

/**
 * Writes each patch's drawn kind into its content's kind slot, and names the rare kinds the planet
 * holds a guaranteed cluster of (ticket 737).
 */
export const rosterMaterialsHook: GenerationHook = {
  id: ROSTER_HOOK_ID,
  patchContent: (params, patch, content, seed) => ({
    ...content,
    kindSlot: kindSlotOfPatch(params, patch, content, seed),
  }),
  clusterKinds: rareClusterKindsOf,
}

/** The roster index plus one of the kind the patch draws, `NO_KIND_SLOT` when none is live. */
export function kindSlotOfPatch(
  params: PlanetParams,
  patch: OrePatch,
  content: PatchContent,
  seed: number,
): number {
  const live = liveRosterIndicesOf(params, patch.band, content)
  if (live.length === 0) return NO_KIND_SLOT
  return live[rollOfPatch(seed, patch) % live.length] + 1
}

/**
 * The roster indices of the kinds live on a patch of this band and content: the kind's family is
 * the cell's, its rarity is the tier the patch's lead names, and the band is in its window.
 */
export function liveRosterIndicesOf(
  params: PlanetParams,
  band: number,
  content: PatchContent,
): number[] {
  const familyId = familyOfCellCode(content.family)?.id
  const rarityId = rarityTiers()[content.tierOffset - (band - 1)]?.id
  const isLiveInBand = (slot: KindSlot) => isSlotLiveInBand(slot, band, params.oreRulesVersion)
  return planetRosterOf(params).flatMap((slot, index) =>
    isKindOf(slot, familyId, rarityId) && isLiveInBand(slot) ? [index] : [],
  )
}

function isKindOf(slot: KindSlot, familyId: string | undefined, rarityId: string | undefined) {
  return slot.family === familyId && slot.rarity === rarityId
}

function rollOfPatch(seed: number, { band, centre }: OrePatch): number {
  return hashCell(hashCell(seed, band, 0), centre.tx, centre.ty)
}
