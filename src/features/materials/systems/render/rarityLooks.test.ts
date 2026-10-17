import { describe, expect, it } from 'vitest'
import { ORE_LOOKS } from '../../../ore-visuals'
import lookFile from '../../rarityLooks.json'
import { FRAMED_RARITIES, RARITY_LOOKS, rarityLookProblems } from './rarityLooks'

// Ticket 450 (Vertical Scaler's condition 3 on #450): each rarity draws at least what the one
// below it draws, in a brighter tint, and no tint borrows the heat or enemy hues (#151).

const BANDS = ORE_LOOKS.reservedHueBands
const ROWS = lookFile.rarityLooks

describe('rarity looks', () => {
  it('ships a frame, tint and glow for every rarity above common, in order', () => {
    expect(rarityLookProblems(lookFile, BANDS)).toEqual([])
    expect(RARITY_LOOKS.map((look) => look.rarity)).toEqual(FRAMED_RARITIES)
  })

  it('refuses a rarity whose frame is no wider or whose glow falls below the one under it', () => {
    const [uncommon, rare, ...rest] = ROWS
    const broken = { rarityLooks: [uncommon, { ...rare, frame: uncommon.frame, glow: 0 }, ...rest] }
    expect(rarityLookProblems(broken, BANDS)).toEqual([
      'rarityLooks[1] (rare).frame must be wider',
      'rarityLooks[1] (rare).glow must not fall',
    ])
  })

  it('refuses a tint no brighter than the rarity under it', () => {
    const [uncommon, rare, ...rest] = ROWS
    const broken = { rarityLooks: [uncommon, { ...rare, tint: uncommon.tint }, ...rest] }
    expect(rarityLookProblems(broken, BANDS)).toEqual([
      'rarityLooks[1] (rare).tint must be brighter',
    ])
  })

  it('refuses a tint in a reserved hue band', () => {
    const [uncommon, ...rest] = ROWS
    const ember = { rarityLooks: [{ ...uncommon, tint: '#ff8020' }, ...rest] }
    expect(rarityLookProblems(ember, BANDS)).toEqual([
      "rarityLooks[0].tint's hue 26 falls in the reserved 15-45 degrees",
    ])
  })

  it('refuses rows that skip or reorder a rarity', () => {
    const [uncommon, rare, epic, mythic] = ROWS
    expect(rarityLookProblems({ rarityLooks: [uncommon, epic, rare, mythic] }, BANDS)).toEqual([
      'rarityLooks must name uncommon, rare, epic, mythic in that order',
    ])
  })
})
