import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { createAuthorityState } from '../authority/authorityState'
import { planetParamsFor } from '../world/planetParams'
import { AIR_CELL, oreCell, RESOURCE_FAMILY } from '../world/worldCell'
import type { KindLook, RarityLook } from './kindLookTable'
import { cellRarityReaderOf, rarityOfLead, seenRarityOfFind } from './seenRarity'

// Ticket 454 under #139 (GD ruling 2): a material's rarity shows only once the player has seen its
// species; an unseen one, a cell of no species and a planet with no provider stay unspecified.

const PLAYER = 'p1'
const SEED = 83921
const PARAMS = planetParamsFor(SEED, 3)
const RARITY_IDS = ['common', 'uncommon', 'rare', 'epic', 'mythic']

const COMMON_LUMP: KindLook = {
  speciesId: 'probe-lump',
  silhouette: 'nuggets',
  pattern: 'mottled',
  colour: [0.5, 0.5, 0.5],
  rarityLead: 0,
  isHero: false,
}
const RARE_WIRE: KindLook = { ...COMMON_LUMP, speciesId: 'probe-wire', rarityLead: 2 }
const RARITY_LOOKS: RarityLook[] = [1, 2, 3, 4].map((lead) => ({
  tint: [lead / 4, 0, 0],
  frame: lead / 100,
  glow: lead / 4,
  pulse: lead > 2 ? 0.3 : 0,
}))

/** A roster of slot 1 common, slot 2 rare and slot 3 with no species, and a codex of `met`. */
function probeSlice(met: readonly string[]): SliceDefinition {
  return {
    id: 'probe',
    register: (r) => {
      r.kindLook({
        id: 'probe.kind-look',
        kindLooksOf: () => [COMMON_LUMP, RARE_WIRE, null],
        rarityLooks: () => RARITY_LOOKS,
        rarityIdOfLead: (lead) => RARITY_IDS[lead] ?? null,
        hasSeenKind: (_state, _playerId, speciesId) => met.includes(speciesId),
        heroAtlasOf: () => null,
      })
    },
  }
}

const STATE = createAuthorityState({ planetIndex: 3, planetSeed: SEED, playerIds: [PLAYER] })

function rarityOfCell(cell: number, met: readonly string[]) {
  return withRegistrations([probeSlice(met)], () => cellRarityReaderOf(STATE, PLAYER, PARAMS)(cell))
}

describe('seen rarity', () => {
  it("leaves an unseen species' rarity unspecified", () => {
    const cell = oreCell(RESOURCE_FAMILY.metal, 2, 2)
    expect(rarityOfCell(cell, [])).toEqual({ hasSpecies: true, seen: null })
  })

  it("names a seen species' rarity with the tint and pulse the ground draws it in", () => {
    const cell = oreCell(RESOURCE_FAMILY.metal, 2, 2)
    expect(rarityOfCell(cell, ['probe-wire']).seen).toEqual({
      lead: 2,
      rarity: 'rare',
      tint: RARITY_LOOKS[1].tint,
      pulse: 0,
    })
  })

  it('names a seen common species with no tint', () => {
    const cell = oreCell(RESOURCE_FAMILY.metal, 0, 1)
    expect(rarityOfCell(cell, ['probe-lump']).seen).toEqual({
      lead: 0,
      rarity: 'common',
      tint: null,
      pulse: 0,
    })
  })

  it('reads each cell by its own species, so seeing one species reveals no other', () => {
    expect(rarityOfCell(oreCell(RESOURCE_FAMILY.metal, 0, 1), ['probe-wire']).seen).toBeNull()
  })

  it('says a cell with no species, or no ore, has no material rarity at all', () => {
    const met = ['probe-lump', 'probe-wire']
    expect(rarityOfCell(oreCell(RESOURCE_FAMILY.metal, 2), met)).toEqual({
      hasSpecies: false,
      seen: null,
    })
    expect(rarityOfCell(oreCell(RESOURCE_FAMILY.metal, 2, 3), met).hasSpecies).toBe(false)
    expect(rarityOfCell(AIR_CELL, met).hasSpecies).toBe(false)
  })

  it('specifies nothing on a game with no kind look provider (no materials)', () => {
    const cell = oreCell(RESOURCE_FAMILY.metal, 2, 2)
    const read = withRegistrations([], () => cellRarityReaderOf(STATE, PLAYER, PARAMS)(cell))
    expect(read).toEqual({ hasSpecies: false, seen: null })
    expect(withRegistrations([], () => rarityOfLead(2))).toBeNull()
  })

  it("names a found unit's rarity only once a species of that rarity is seen", () => {
    const findOf = (met: readonly string[], lead: number) =>
      withRegistrations([probeSlice(met)], () => seenRarityOfFind(STATE, PLAYER, PARAMS, lead))
    expect(findOf([], 2)).toBeNull()
    expect(findOf(['probe-lump'], 2)).toBeNull()
    expect(findOf(['probe-wire'], 2)?.rarity).toBe('rare')
    expect(findOf(['probe-wire'], -1)).toBeNull()
  })
})
