/**
 * The rarity lead (#140 "rarity lead", #141 "Rolls are per patch"): each ore patch of band `b`
 * rolls a lead on its planet's rarity rows and holds tier `t + lead`, so a rare patch is a deeper
 * ore turning up early, with that tier's value and hardness. One roll per patch, so a vein reads as
 * one ore. Vertical.
 *
 * The rows (ticket 445, `rarityLeads.ts`): a planet on the legacy rows rolls 0, +1 or +2 on
 * `leadWeights(b)` exactly as before; a planet entered under the ore rules from P3 rolls 0 to +4
 * (common to mythic) on Systems' mixed weights. The rarest lead takes the lowest rolls, so with
 * epic and mythic at 0 the legacy rows roll what they always rolled.
 *
 * The roll is a `patchContent` fold (feature-slices.md 3.8): it adds the lead to whatever tier
 * offset the fold received (the lattice's `b - 1`), keyed on the hook's own sub-seed and the
 * patch's band and centre, so it is a pure function of the planet and the patch in any chunk order,
 * and the family stream underneath never moves. The offset goes from 0-4 to 0-8 (#140 "Cell
 * storage", ticket 445). Integer only.
 */
import { hashCell } from '../../../systems/cellRandom'
import type { GenerationHook, PatchContent } from '../../../systems/registries/generationHooks'
import type { OrePatch } from '../../../systems/world/orePatches'
import type { PlanetParams } from '../../../systems/world/planetParams'
import { bandOfTile } from '../../../systems/world/planetGeometry'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { CELL_KIND, kindOfCell, tierOffsetOfCell } from '../../../systems/world/worldCell'
import type { RarityRowSet } from './rarityRows'
import { rarityLeadBucketsBpOf, rarityRowSetOfPlanet } from './rarityLeads'

export const ORE_LEAD_HOOK_ID = 'ores.lead'

const BASIS_POINTS = 10000

/** Adds each patch's rolled lead to its tier offset. */
export const oreLeadHook: GenerationHook = {
  id: ORE_LEAD_HOOK_ID,
  patchContent: (params, patch, content, seed) =>
    withLead(content, leadOfPatch(seed, patch, rarityRowSetOfPlanet(params))),
}

/** The lead a patch rolls under the hook's sub-seed, on the planet's rows. */
export function leadOfPatch(seed: number, patch: OrePatch, set: RarityRowSet): number {
  return leadOfRoll(set, patch.band, rollOfPatch(seed, patch))
}

/**
 * For a roll in 0..9999, the rarest lead first: each lead below the sum of its weight and every
 * rarer one's, else 0. On the legacy rows: +2 below `plus2Bp`, +1 below `plus2Bp + plus1Bp`.
 */
export function leadOfRoll(set: RarityRowSet, band: number, rollBp: number): number {
  const buckets = rarityLeadBucketsBpOf(set, band)
  let below = 0
  for (let lead = buckets.length - 1; lead > 0; lead--) {
    below += buckets[lead]
    if (rollBp < below) return lead
  }
  return 0
}

/**
 * The lead an ore cell holds: its tier offset above its own band's. Ore is painted only into its
 * patch's band, so this is the rolled lead; 0 for every other cell kind.
 */
export function leadOfCell(params: PlanetParams, tile: TilePoint, cell: number): number {
  if (kindOfCell(cell) !== CELL_KIND.ore) return 0
  return tierOffsetOfCell(cell) - (bandOfTile(params, tile.tx, tile.ty) - 1)
}

function rollOfPatch(seed: number, { band, centre }: OrePatch): number {
  return hashCell(hashCell(seed, band, 0), centre.tx, centre.ty) % BASIS_POINTS
}

function withLead(content: PatchContent, lead: number): PatchContent {
  return { ...content, tierOffset: content.tierOffset + lead }
}
