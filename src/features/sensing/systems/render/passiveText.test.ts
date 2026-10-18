import { describe, expect, it } from 'vitest'
import { fromSafeInteger } from '../../../../systems/money'
import type { CellRarity } from '../../../../systems/render/seenRarity'
import type { AssayReading } from '../assayLens'
import { assayCardTextOf } from './passiveText'

// Ticket 454 under #139 (GD ruling 2): the lens names a species' rarity only once it is seen, so
// the lead that would name it stays off the card of an unseen species; a cell of no species (a
// legacy planet, P8+) reads its lead as the #162 row always did.

const UNSEEN: CellRarity = { hasSpecies: true, seen: null }
const SEEN: CellRarity = {
  hasSpecies: true,
  seen: { lead: 2, rarity: 'rare', tint: [0, 0, 1], pulse: 0 },
}
const NO_SPECIES: CellRarity = { hasSpecies: false, seen: null }

function readingOf(rarity: CellRarity): AssayReading {
  return {
    tile: { tx: 0, ty: 0 },
    oreId: 'metal_t3',
    family: 'metal',
    grade: 2,
    lead: 2,
    unitPrice: fromSafeInteger(5),
    gate: 'none',
    gateItem: null,
    rarity,
  }
}

describe('assay card text', () => {
  it("leaves an unseen species' lead unspecified", () => {
    expect(assayCardTextOf(readingOf(UNSEEN)).lead).toBeNull()
  })

  it("shows a seen species' lead", () => {
    expect(assayCardTextOf(readingOf(SEEN)).lead).toBe('+2')
  })

  it('shows the lead of a cell with no species, as before materials', () => {
    expect(assayCardTextOf(readingOf(NO_SPECIES)).lead).toBe('+2')
  })

  it('prices every card the same whether its species is seen or not', () => {
    const prices = [UNSEEN, SEEN, NO_SPECIES].map(
      (rarity) => assayCardTextOf(readingOf(rarity)).price,
    )
    expect(new Set(prices).size).toBe(1)
  })
})
