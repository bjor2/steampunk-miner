import { describe, expect, it } from 'vitest'
import {
  gateBitsOf,
  gateLookOfBits,
  MAX_GATE_KIND,
  MAX_GATE_STATE,
  NO_GATE_BITS,
  type CellGateLook,
} from './cellGateBits'

const EVERY_LOOK: CellGateLook[] = Array.from({ length: MAX_GATE_KIND + 1 }, (_, kind) =>
  Array.from({ length: MAX_GATE_STATE + 1 }, (_, state) => ({ kind, state })),
).flat()

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

  it('refuses a kind or state outside the channel instead of trimming it', () => {
    expect(() => gateBitsOf({ kind: 16, state: 0 })).toThrow(RangeError)
    expect(() => gateBitsOf({ kind: 0, state: 8 })).toThrow(RangeError)
    expect(() => gateBitsOf({ kind: -1, state: 0 })).toThrow(RangeError)
    expect(() => gateBitsOf({ kind: 1.5, state: 0 })).toThrow(RangeError)
  })
})
