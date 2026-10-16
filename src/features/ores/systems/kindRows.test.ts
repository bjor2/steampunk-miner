import { describe, expect, it } from 'vitest'
import economyFile from '../ores.economy.json'
import familiesFile from '../oreFamilies.json'
import { isSlotLiveInBand } from './kindRows'
import { ORE_ROWS, oreRowProblems } from './oreRows'

// The kind slot tables (TD ruling on ticket 446, addendum 6226264758; Systems' kinds.legacy,
// 6226282340): the economy side of a material kind, refused whole when a slot breaks a rule.

type Slot = (typeof economyFile.ore.kinds.legacy)[number]

/** The shipped files with the legacy table and the cap replaced. */
function problemsWithLegacy(legacy: readonly unknown[], rosterMaxKinds = 15): string[] {
  const kinds = { ...economyFile.ore.kinds, rosterMaxKinds, legacy }
  return oreRowProblems({ ore: { ...economyFile.ore, kinds } }, familiesFile)
}

const C1: Slot = economyFile.ore.kinds.legacy[0]

describe('ore kind slots', () => {
  it('ships Systems twelve legacy slots, 5 common, 4 uncommon and 3 rare, under the cap of 15', () => {
    const legacy = ORE_ROWS.kinds.slotsBySet.legacy
    const count = (rarity: string) => legacy.filter((slot) => slot.rarity === rarity).length
    expect(legacy.map((slot) => slot.slotId)).toEqual([
      ...['c1', 'c2', 'c3', 'c4', 'c5', 'u1', 'u2', 'u3', 'u4', 'r1', 'r2', 'r3'].map(
        (name) => `legacy.${name}`,
      ),
    ])
    expect([count('common'), count('uncommon'), count('rare')]).toEqual([5, 4, 3])
    expect(ORE_ROWS.kinds.rosterMaxKinds).toBe(15)
  })

  it('reads a slot live in the bands of its window only', () => {
    const [c3] = ORE_ROWS.kinds.slotsBySet.legacy.filter((slot) => slot.slotId === 'legacy.c3')
    expect([1, 2, 3, 4, 5].map((band) => isSlotLiveInBand(c3, band))).toEqual([
      false,
      false,
      true,
      true,
      true,
    ])
  })

  it('refuses a table with more kinds than rosterMaxKinds', () => {
    expect(problemsWithLegacy(economyFile.ore.kinds.legacy, 11)).toEqual([
      'ore.kinds.legacy holds 12 kinds, over rosterMaxKinds',
    ])
  })

  it('refuses a kind live in a band where its tier weighs nothing', () => {
    const early = { ...C1, slotId: 'legacy.r9', rarity: 'rare', window: [2, 3] }
    expect(problemsWithLegacy([early])).toEqual([
      'ore.kinds.legacy[0] is live in band 2, where legacy rare weighs nothing',
    ])
  })

  it('refuses an unknown family, rarity, window or slot id, and a slot listed twice', () => {
    expect(
      problemsWithLegacy([
        { ...C1, family: 'brass' },
        { ...C1, rarity: 'legendary' },
        { ...C1, window: [4, 2] },
        { ...C1, slotId: 'mixed.c1' },
        C1,
      ]),
    ).toEqual([
      'ore.kinds.legacy[0].family must name an ore family',
      'ore.kinds.legacy[1].rarity must name a rarity tier',
      'ore.kinds.legacy[2].window must be [first, last] in 1..5',
      'ore.kinds.legacy[3].slotId must be "legacy.<name>"',
      'kind slot "legacy.c1" twice',
    ])
  })
})
