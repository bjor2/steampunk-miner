import { describe, expect, it } from 'vitest'
import { kindEntryOf, type KindLook } from '../../systems/render/kindLookTable'
import { hueSlotColourOf, MATERIALS, type Material } from '../materials'
import mineralSkinsFile from './mineralSkins.json'
import { loadSkinTable, skinGuardContext, unskinnedSpeciesOf } from './systems/skinTable'

// Ticket 854 (HS ruling (c) of 24 Oct on #852: every material looks different): every species of
// the materials table wears a skin row, and the CI fails the day one does not. A species missing
// its row still draws on the ground: the terrain shader reads the catalogue look of its materials
// row (silhouette, pattern, hue slot colour; `kindLookTable.ts`), never a skin row, so the generic
// fallback is that look and never the all-zero entry of a slot binding no species.

const LOST_SPECIES = 'chalk-bed-amberbone'

/** The shipped file less the skin row of one species. */
function tableWithout(species: string) {
  const skins = mineralSkinsFile.skins.filter((row) => row.species !== species)
  return loadSkinTable({ ...mineralSkinsFile, skins }, skinGuardContext())
}

/** The look the terrain draws for a species on frame 1, unmet and with no atlas cell. */
function catalogueLookOf(species: Material): KindLook {
  const slot = MATERIALS.hueSlots.find((hueSlot) => hueSlot.id === species.hueSlot)
  if (slot === undefined) throw new Error(`${species.id} names no hue slot`)
  return {
    speciesId: species.id,
    silhouette: species.silhouette,
    pattern: species.pattern,
    colour: hueSlotColourOf(slot),
    rarityLead: 0,
    isHero: species.hero,
    gemRank: null,
  }
}

describe('mineral skins of every species (ticket 854)', () => {
  it('gives every species of the materials table a skin row', () => {
    expect(unskinnedSpeciesOf()).toEqual([])
  })

  it('names the species whose skin row is missing', () => {
    expect(unskinnedSpeciesOf(tableWithout(LOST_SPECIES))).toEqual([LOST_SPECIES])
  })

  it.each(MATERIALS.materials.map((species) => [species.id, species] as const))(
    'draws %s without a skin row as its catalogue look, never the bare ground',
    (_, species) => {
      const [silhouetteCode, patternCode, colour] = kindEntryOf(catalogueLookOf(species))
      expect(silhouetteCode).toBeGreaterThan(0)
      expect(patternCode).toBeGreaterThan(0)
      expect(colour).toBeGreaterThan(0)
    },
  )
})
