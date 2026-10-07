/**
 * The planet mix as a `patchContent` fold (feature-slices.md 3.8; #141 "Rolls are per patch"): one
 * family per patch, so a vein reads as one ore and #142's connected same-ore cells hold.
 *
 * Hooks fold in id order, so `ores.lead` has already lifted the patch's tier offset by its lead
 * (#155 TD: `ores.*` runs before `planet-mix.*`). This fold reads that lead back, gives the patch
 * the family of its tier from the mix, and leaves the offset alone: the signature takes patches of
 * its own tier (`t_5`), so carving it out never moves a tier. Which of those patches wear the
 * signature is a roll on the hook's own sub-seed, keyed on the band and the centre, uniform over
 * the entry the signature is carved from. P1 and P2 pass through untouched. Integer only.
 */
import { hashCell } from '../../../systems/cellRandom'
import { isHeatPlanet } from '../../../systems/economy/heatEconomy'
import type { GenerationHook, PatchContent } from '../../../systems/registries/generationHooks'
import type { OrePatch } from '../../../systems/world/orePatches'
import type { PlanetParams } from '../../../systems/world/planetParams'
import type { ResourceFamily } from '../../../systems/world/worldCell'
import { oreFamilies, oreTierOf } from '../../ores'
import {
  familyAtTier,
  isMixedPlanet,
  leadBucketsBpOf,
  PLANET_MIX_HOOK_ID,
  signatureLeadOf,
  signatureShareBpOf,
} from './oreMix'
import { MIX_STREAM, planetMixPlanOf, type PlanetMixPlan } from './planetActs'

/** Whether a patch centred here lies within the lava radius of a pocket (#141, heat act only). */
export type IsNearLava = (params: PlanetParams, patch: OrePatch) => boolean

/** The fold, with the lava question the kernel answers once it exposes the pocket lattice. */
export function planetMixHookOf(isNearLava: IsNearLava): GenerationHook {
  return {
    id: PLANET_MIX_HOOK_ID,
    patchContent: (params, patch, content, seed) =>
      isMixedPlanet(params.planetIndex)
        ? withMixedFamily(params, patch, content, seed, isNearLava)
        : content,
  }
}

/** The family a patch wears on a mixed planet, given the lead `ores.lead` gave it. */
export function familyOfPatch(
  plan: PlanetMixPlan,
  patch: OrePatch,
  lead: number,
  seed: number,
  isNearLava: boolean,
): { family: string; signature: boolean } {
  const tier = oreTierOf(plan.planetIndex, patch.band, lead)
  if (isSignaturePatch(plan, patch, lead, seed, isNearLava))
    return { family: plan.act.signature ?? familyAtTier(plan, tier), signature: true }
  return { family: familyAtTier(plan, tier), signature: false }
}

function withMixedFamily(
  params: PlanetParams,
  patch: OrePatch,
  content: PatchContent,
  seed: number,
  isNearLava: IsNearLava,
): PatchContent {
  const plan = keptPlanOf(params, seed)
  const lead = content.tierOffset - (patch.band - 1)
  const nearLava = isHeatPlanet(params.planetIndex) && isNearLava(params, patch)
  const { family } = familyOfPatch(plan, patch, lead, seed, nearLava)
  return { ...content, family: cellCodeOf(family) }
}

/** The family's value in the cell's 4-bit family field (the `ores` catalogue's order). */
function cellCodeOf(family: string): ResourceFamily {
  const row = oreFamilies().find((candidate) => candidate.id === family)
  if (row === undefined) throw new RangeError(`no ore family "${family}" in the catalogue`)
  return row.cellCode as ResourceFamily
}

/** Uniform over the patches of the signature's entry: below its share of that entry's weight. */
function isSignaturePatch(
  plan: PlanetMixPlan,
  patch: OrePatch,
  lead: number,
  seed: number,
  isNearLava: boolean,
): boolean {
  if (lead !== signatureLeadOf(patch.band)) return false
  const shareBp = signatureShareBpOf(plan, patch.band, isNearLava)
  if (shareBp === 0) return false
  return signatureRollOf(seed, patch) % leadBucketsBpOf(patch.band)[lead] < shareBp
}

function signatureRollOf(seed: number, { band, centre }: OrePatch): number {
  return hashCell(hashCell(seed, MIX_STREAM.signature, band), centre.tx, centre.ty)
}

/** The plan is planet-wide and every patch asks for it, so it is kept per params object. */
const plansOfParams = new WeakMap<PlanetParams, PlanetMixPlan>()

function keptPlanOf(params: PlanetParams, seed: number): PlanetMixPlan {
  const kept = plansOfParams.get(params) ?? planetMixPlanOf(params.planetIndex, seed)
  plansOfParams.set(params, kept)
  return kept
}
