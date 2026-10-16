/**
 * The planet mix as a `patchContent` fold (feature-slices.md 3.8; #141 "Rolls are per patch"): one
 * family per patch, so a vein reads as one ore and #142's connected same-ore cells hold.
 *
 * Hooks fold in id order, so `ores.lead` has already lifted the patch's tier offset by its lead
 * (#155 TD: `ores.*` runs before `planet-mix.*`). This fold reads that lead back and gives the patch
 * the family of its tier from the mix. Which patches wear the signature is a roll on the hook's own
 * sub-seed, keyed on the band and the centre, uniform over the entry the signature is carved from.
 * On the legacy rows that entry is the signature's own tier (`t_5`), so the offset is left alone; on
 * the mixed rows (ticket 445) it is band 4's common, so the fold lifts a signature patch there to
 * `t_5`, the tier a signature always has. P1 and P2 pass through untouched. Integer only.
 */
import { hashCell } from '../../../systems/cellRandom'
import { isHeatPlanet } from '../../../systems/economy/heatEconomy'
import type { GenerationHook, PatchContent } from '../../../systems/registries/generationHooks'
import { isLavaPocketNear } from '../../../systems/world/lavaPockets'
import type { OrePatch } from '../../../systems/world/orePatches'
import type { PlanetParams } from '../../../systems/world/planetParams'
import { BAND_COUNT } from '../../../systems/world/planetGeometry'
import type { ResourceFamily } from '../../../systems/world/worldCell'
import {
  oreFamilies,
  oreTierOf,
  rarityLeadBucketsBpOf,
  rarityRowSetOfPlanet,
  type RarityRowSet,
} from '../../ores'
import {
  familyAtTier,
  isMixedPlanet,
  PLANET_MIX_HOOK_ID,
  signatureCarveLeadOf,
  signatureLeadOf,
  signatureShareBpOf,
} from './oreMix'
import { MIX_STREAM, planetMixPlanOf, type PlanetMixPlan } from './planetActs'
import { THEME_ROWS } from './themeRows'

/** A signature is `<signature>_t<t_5>` (#141): band 5's tier, offset 4 over band 1's. */
const SIGNATURE_TIER_OFFSET = BAND_COUNT - 1

/** Whether a patch centred here lies within the lava radius of a pocket (#141, heat act only). */
export type IsNearLava = (params: PlanetParams, patch: OrePatch) => boolean

/** The fold, with the lava question passed in so a spec can fix it. */
export function planetMixHookOf(isNearLava: IsNearLava): GenerationHook {
  return {
    id: PLANET_MIX_HOOK_ID,
    patchContent: (params, patch, content, seed) =>
      isMixedPlanet(params.planetIndex)
        ? withMixedFamily(params, patch, content, seed, isNearLava)
        : content,
  }
}

/** #141 "signature near lava": the patch's centre within the lava radius of a pocket (#232). */
export function isPatchNearLava(params: PlanetParams, patch: OrePatch): boolean {
  return isLavaPocketNear(params, patch.centre, THEME_ROWS.lavaRadiusTiles)
}

/** The family a patch wears on a mixed planet, given the lead `ores.lead` gave it. */
export function familyOfPatch(
  plan: PlanetMixPlan,
  patch: OrePatch,
  lead: number,
  seed: number,
  isNearLava: boolean,
  set: RarityRowSet,
): { family: string; signature: boolean } {
  if (isSignaturePatch(plan, patch, lead, seed, isNearLava, set)) {
    const tier = oreTierOf(plan.planetIndex, patch.band, signatureLeadOf(patch.band))
    return { family: plan.act.signature ?? familyAtTier(plan, tier), signature: true }
  }
  return {
    family: familyAtTier(plan, oreTierOf(plan.planetIndex, patch.band, lead)),
    signature: false,
  }
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
  const worn = familyOfPatch(plan, patch, lead, seed, nearLava, rarityRowSetOfPlanet(params))
  const tierOffset = worn.signature ? SIGNATURE_TIER_OFFSET : content.tierOffset
  return { family: cellCodeOf(worn.family), tierOffset }
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
  set: RarityRowSet,
): boolean {
  if (lead !== signatureCarveLeadOf(set, patch.band)) return false
  const shareBp = signatureShareBpOf(plan, patch.band, isNearLava, set)
  if (shareBp === 0) return false
  return signatureRollOf(seed, patch) % rarityLeadBucketsBpOf(set, patch.band)[lead] < shareBp
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
