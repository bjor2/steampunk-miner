import { describe, expect, it } from 'vitest'
import {
  cellMarkerBitsOf,
  gateBitsOf,
  gateLookOfBits,
  isElectrifiedBits,
  MAX_GATE_KIND,
  MAX_GATE_OPENING_MAJOR,
  MAX_GATE_STATE,
  NO_GATE_BITS,
  type CellGateLook,
} from './cellGateBits'

const EVERY_LOOK: CellGateLook[] = Array.from({ length: MAX_GATE_KIND + 1 }, (_, kind) =>
  Array.from({ length: MAX_GATE_STATE + 1 }, (_, state) => ({ kind, state })),
).flat()

const OPENING_MAJORS = [0, 1, 34, 4096, MAX_GATE_OPENING_MAJOR]

describe('cell gate bits', () => {
  it('holds at least 16 gate kinds and 8 states, sized for the whole act table', () => {
    expect(MAX_GATE_KIND).toBeGreaterThanOrEqual(15)
    expect(MAX_GATE_STATE).toBeGreaterThanOrEqual(7)
  })

  it('round-trips every kind and state, kind 15 and state 7 included', () => {
    expect(EVERY_LOOK.map((look) => gateLookOfBits(gateBitsOf(look)))).toEqual(EVERY_LOOK)
  })

  it('gives every look its own bits, none of them the no-gate bits', () => {
    const bits = EVERY_LOOK.map(gateBitsOf)
    expect(new Set(bits).size).toBe(EVERY_LOOK.length)
    expect(bits).not.toContain(NO_GATE_BITS)
  })

  it('reads the no-gate bits as no gate', () => {
    expect(gateBitsOf(null)).toBe(NO_GATE_BITS)
    expect(gateLookOfBits(NO_GATE_BITS)).toBeNull()
  })

  it('stays exact in a float attribute', () => {
    const bits = EVERY_LOOK.map(gateBitsOf)
    expect(Array.from(Float32Array.from(bits))).toEqual(bits)
  })

  it('round-trips the tip major that opens a rim, kind 15 and state 7 included', () => {
    const looks = OPENING_MAJORS.map((opensAtTipMajor) => ({ kind: 15, state: 7, opensAtTipMajor }))
    expect(looks.map((look) => gateLookOfBits(gateBitsOf(look)))).toEqual(looks)
  })

  it('keeps a rim that opens at major 0 apart from a gate no tip opens', () => {
    const opensAtOnce = gateBitsOf({ kind: 0, state: 0, opensAtTipMajor: 0 })
    expect(opensAtOnce).not.toBe(gateBitsOf({ kind: 0, state: 0 }))
    expect(gateLookOfBits(gateBitsOf({ kind: 0, state: 0 }))).not.toHaveProperty('opensAtTipMajor')
  })

  it('stays exact in a float attribute at the highest opening major', () => {
    const bits = gateBitsOf({ kind: 15, state: 7, opensAtTipMajor: MAX_GATE_OPENING_MAJOR })
    expect(Float32Array.from([bits])[0]).toBe(bits)
    expect(bits).toBeLessThan(2 ** 24)
  })

  it('refuses an opening major outside the channel instead of trimming it', () => {
    const outside = [-1, 2.5, MAX_GATE_OPENING_MAJOR + 1]
    for (const opensAtTipMajor of outside) {
      expect(() => gateBitsOf({ kind: 0, state: 0, opensAtTipMajor })).toThrow(RangeError)
    }
  })

  it('refuses a kind or state outside the channel instead of trimming it', () => {
    expect(() => gateBitsOf({ kind: 16, state: 0 })).toThrow(RangeError)
    expect(() => gateBitsOf({ kind: 0, state: 8 })).toThrow(RangeError)
    expect(() => gateBitsOf({ kind: -1, state: 0 })).toThrow(RangeError)
    expect(() => gateBitsOf({ kind: 1.5, state: 0 })).toThrow(RangeError)
  })

  it("keeps an electrified cell's bit apart from the gate it shows, exact in a float", () => {
    const looks = [null, ...EVERY_LOOK, ...OPENING_MAJORS.map((major) => openingAt(major))]
    for (const look of looks) {
      const bits = cellMarkerBitsOf(look, true)
      expect(gateLookOfBits(bits)).toEqual(look)
      expect(isElectrifiedBits(bits)).toBe(true)
      expect(isElectrifiedBits(cellMarkerBitsOf(look, false))).toBe(false)
      expect(Math.fround(bits)).toBe(bits)
    }
  })
})

function openingAt(opensAtTipMajor: number): CellGateLook {
  return { kind: MAX_GATE_KIND, state: MAX_GATE_STATE, opensAtTipMajor }
}
