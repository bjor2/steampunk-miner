import { describe, expect, it } from 'vitest'
import { generationHooks, type PatchContent } from '../../../systems/registries/generationHooks'
import { subSeedForHook } from '../../../systems/registries/hookSeed'
import type { OrePatch } from '../../../systems/world/orePatches'
import { planetParamsFor, type PlanetParams } from '../../../systems/world/planetParams'
import { RESOURCE_FAMILY } from '../../../systems/world/worldCell'
import { ORE_LEAD_HOOK_ID } from '../../ores'
import { PLANET_MIX_HOOK_ID } from '../../planet-mix'
import { planetRosterOf } from './planetRoster'
import { kindSlotOfPatch, liveRosterIndicesOf, ROSTER_HOOK_ID } from './rosterFold'

// The roster fold (TD ruling on ticket 446, section 2; Systems' family-first rule, 6226198316):
// one pick per patch, uniform over the live kinds of its own family and rarity in its band.

const SEED = 83921
const RULES_TWO = 2
const PATCHES = 4000

function patchAt(band: number, at: number, family = RESOURCE_FAMILY.metal): OrePatch {
  return { band, centre: { tx: at, ty: -at * 7 }, family, tiles: [] }
}

/** The patch's content as the lattice and the lead roll leave it: `lead` tiers above its band. */
function contentOf(patch: OrePatch, lead: number): PatchContent {
  return { family: patch.family, tierOffset: patch.band - 1 + lead }
}

function slotIdsOf(params: PlanetParams, band: number, content: PatchContent): string[] {
  const roster = planetRosterOf(params)
  return liveRosterIndicesOf(params, band, content).map((index) => roster[index].slotId)
}

function drawsOf(params: PlanetParams, band: number, lead: number): Map<number, number> {
  const seed = subSeedForHook(params, ROSTER_HOOK_ID)
  const draws = new Map<number, number>()
  for (let at = 0; at < PATCHES; at++) {
    const patch = patchAt(band, at)
    const slot = kindSlotOfPatch(params, patch, contentOf(patch, lead), seed)
    draws.set(slot, (draws.get(slot) ?? 0) + 1)
  }
  return draws
}

describe('roster fold', () => {
  it('runs after the lead roll and the planet mix, so it reads the final family and tier', () => {
    const ids = generationHooks().map((hook) => hook.id)
    expect(ids.indexOf(ROSTER_HOOK_ID)).toBeGreaterThan(ids.indexOf(ORE_LEAD_HOOK_ID))
    expect(ids.indexOf(ROSTER_HOOK_ID)).toBeGreaterThan(ids.indexOf(PLANET_MIX_HOOK_ID))
    expect(ids.indexOf(ORE_LEAD_HOOK_ID)).toBeGreaterThanOrEqual(0)
  })

  it('finds the kinds of the patch family and rarity live in its band, and only those', () => {
    const params = planetParamsFor(SEED, 1, RULES_TWO)
    const metalCommon = { family: RESOURCE_FAMILY.metal, tierOffset: 0 }
    const crystalRareBand4 = { family: RESOURCE_FAMILY.crystal, tierOffset: 3 + 2 }
    expect(slotIdsOf(params, 1, metalCommon)).toEqual(['legacy.c1', 'legacy.c2'])
    expect(slotIdsOf(params, 3, { ...metalCommon, tierOffset: 2 })).toEqual([
      'legacy.c1',
      'legacy.c3',
    ])
    expect(slotIdsOf(params, 4, crystalRareBand4)).toEqual(['legacy.r2', 'legacy.r3'])
  })

  it('draws every live kind about equally often', () => {
    const params = planetParamsFor(SEED, 1, RULES_TWO)
    const draws = drawsOf(params, 3, 0)
    const expected = liveRosterIndicesOf(params, 3, { family: 1, tierOffset: 2 }).map(
      (at) => at + 1,
    )
    expect([...draws.keys()].sort()).toEqual(expected)
    // Binomial 4 sigma over 4000 patches split two ways: 126 patches.
    for (const count of draws.values()) expect(Math.abs(count - PATCHES / 2)).toBeLessThan(127)
  })

  it('draws no kind where none is live, or before the ore rules that brought the roster', () => {
    const rulesTwo = planetParamsFor(SEED, 1, RULES_TWO)
    expect([...drawsOf(rulesTwo, 2, 2).keys()]).toEqual([0])
    expect([...drawsOf(planetParamsFor(SEED, 1), 1, 0).keys()]).toEqual([0])
    expect([...drawsOf(planetParamsFor(SEED, 1, 1), 1, 0).keys()]).toEqual([0])
  })

  it('draws the same kind for the same patch, whatever was drawn before', () => {
    const params = planetParamsFor(SEED, 2, RULES_TWO)
    const seed = subSeedForHook(params, ROSTER_HOOK_ID)
    const patch = patchAt(1, 99)
    const once = kindSlotOfPatch(params, patch, contentOf(patch, 0), seed)
    drawsOf(params, 1, 0)
    expect(kindSlotOfPatch(params, patch, contentOf(patch, 0), seed)).toBe(once)
  })

  it('writes the kind slot alone and keeps the family and tier it folded', () => {
    const params = planetParamsFor(SEED, 1, RULES_TWO)
    const hook = generationHooks().find((entry) => entry.id === ROSTER_HOOK_ID)
    const patch = patchAt(2, 5)
    const folded = hook?.patchContent?.(params, patch, contentOf(patch, 1), 77)
    expect(folded).toMatchObject(contentOf(patch, 1))
    expect(folded?.kindSlot).toBeGreaterThan(0)
  })
})
