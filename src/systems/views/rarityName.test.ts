import { describe, expect, it } from 'vitest'
import type { SeenRarity } from '../render/seenRarity'
import { rarityNameOf } from './rarityName'

// Ticket 454 under #139: a seen material's name in its rarity's tint, with a word; epic and
// mythic pulse their glow, but never with reduce motion (static colour and frame only).

const EPIC: SeenRarity = { lead: 3, rarity: 'epic', tint: [1, 0.55, 0.9], pulse: 0.3 }
const RARE: SeenRarity = { lead: 2, rarity: 'rare', tint: [0.435, 0.714, 1], pulse: 0 }
const COMMON: SeenRarity = { lead: 0, rarity: 'common', tint: null, pulse: 0 }

describe('rarity name', () => {
  it('shows nothing for an unspecified rarity, so the name draws as before materials', () => {
    expect(rarityNameOf(null, false)).toBeNull()
    expect(rarityNameOf(null, true)).toBeNull()
  })

  it("colours a seen rarity's name in its tint and names the tier", () => {
    expect(rarityNameOf(RARE, false)).toEqual({
      rarity: 'rare',
      word: 'Rare',
      tint: 'rgb(111 182 255)',
      isPulsing: false,
    })
  })

  it('names a common rarity with no tint', () => {
    expect(rarityNameOf(COMMON, false)).toMatchObject({ word: 'Common', tint: null })
  })

  it("pulses a rarity whose ground glow pulses, while motion isn't reduced", () => {
    expect(rarityNameOf(EPIC, false)?.isPulsing).toBe(true)
  })

  it('holds the glow still with reduce motion, keeping the same colour and word', () => {
    const still = rarityNameOf(EPIC, true)
    expect(still?.isPulsing).toBe(false)
    expect(still).toEqual({ ...rarityNameOf(EPIC, false), isPulsing: false })
  })
})
