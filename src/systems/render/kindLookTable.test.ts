import { describe, expect, it } from 'vitest'
import {
  HERO_LOOK_FLAG,
  KIND_LOOK_SLOTS,
  kindLookTableOf,
  LOOK_VECTOR,
  packedRgbOf,
  rgbOfPacked,
  type KindLook,
  type RarityLook,
} from './kindLookTable'
import { patternCodeOf, silhouetteCodeOf } from './kindLooks'

const NUGGETS: KindLook = {
  speciesId: 'probe-nuggets',
  silhouette: 'nuggets',
  pattern: 'mottled',
  colour: [1, 0.5, 0],
  rarityLead: 0,
  isHero: false,
}

const WIRES: KindLook = {
  speciesId: 'probe-wires',
  silhouette: 'wires',
  pattern: 'veined',
  colour: [0.2, 0.4, 0.6],
  rarityLead: 2,
  isHero: true,
}

const RARE: RarityLook = { tint: [0, 0, 1], frame: 0.04, glow: 0.3, pulse: 0 }

function entryOf(kinds: Float32Array, slot: number): number[] {
  return Array.from(kinds.subarray((slot - 1) * LOOK_VECTOR, slot * LOOK_VECTOR))
}

describe('material look table', () => {
  it('writes a seen species as its silhouette, pattern, packed colour and rarity lead', () => {
    const table = kindLookTableOf([NUGGETS, null, WIRES], [], () => true)
    expect(entryOf(table.kinds, 1)).toEqual([
      silhouetteCodeOf('nuggets'),
      patternCodeOf('mottled'),
      packedRgbOf([1, 0.5, 0]),
      0,
    ])
    expect(entryOf(table.kinds, 3)).toEqual([
      silhouetteCodeOf('wires'),
      patternCodeOf('veined'),
      packedRgbOf([0.2, 0.4, 0.6]),
      2 + HERO_LOOK_FLAG,
    ])
    expect(table.revealedSlots).toBe(2)
  })

  it('leaves a slot with no species and a species not yet seen at zeros, the family look', () => {
    const table = kindLookTableOf([NUGGETS, null, WIRES], [RARE], (look) => look === WIRES)
    expect(entryOf(table.kinds, 1)).toEqual([0, 0, 0, 0])
    expect(entryOf(table.kinds, 2)).toEqual([0, 0, 0, 0])
    expect(table.revealedSlots).toBe(1)
  })

  it('holds at most 17 slots, so a slot past them draws the family look', () => {
    const looks = Array.from({ length: KIND_LOOK_SLOTS + 2 }, () => NUGGETS)
    const table = kindLookTableOf(looks, [], () => true)
    expect(table.kinds.length).toBe(KIND_LOOK_SLOTS * LOOK_VECTOR)
    expect(table.revealedSlots).toBe(KIND_LOOK_SLOTS)
  })

  it('writes each rarity lead as its packed tint, glow, frame and pulse', () => {
    const table = kindLookTableOf([], [RARE], () => true)
    expect(Array.from(table.rarity.subarray(0, LOOK_VECTOR))).toEqual([
      packedRgbOf([0, 0, 1]),
      expect.closeTo(0.3, 6),
      expect.closeTo(0.04, 6),
      0,
    ])
  })

  it('refuses a rarity lead past mythic', () => {
    expect(() => kindLookTableOf([{ ...NUGGETS, rarityLead: 5 }], [], () => true)).toThrow(
      /rarity lead 5/,
    )
  })

  it('packs a colour exactly into a float and reads it back to the byte', () => {
    const packed = packedRgbOf([1, 1, 1])
    expect(Math.fround(packed)).toBe(packed)
    expect(rgbOfPacked(packedRgbOf([0.2, 0.4, 0.6])).map((c) => Math.round(c * 255))).toEqual([
      51, 102, 153,
    ])
  })
})
