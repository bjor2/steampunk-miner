import { describe, expect, it } from 'vitest'
import { isKnownPadChord, PAD_INPUTS, padChordOf, padCodeOfChord, padLabelOf } from './padCodes'

describe('pad codes', () => {
  it('reads the standard mapping buttons by index, Home left out, then the left stick', () => {
    expect(PAD_INPUTS[0]).toEqual({ code: 'PadA', source: { kind: 'button', index: 0 } })
    expect(PAD_INPUTS[11]).toEqual({ code: 'PadRS', source: { kind: 'button', index: 11 } })
    expect(PAD_INPUTS.map((input) => input.code)).not.toContain('PadHome')
    expect(PAD_INPUTS.at(-1)).toEqual({
      code: 'PadLStickDown',
      source: { kind: 'axis', index: 1, sign: 1 },
    })
  })

  it('knows every pad code and an LB chord of one, but not LB chorded with itself', () => {
    expect(isKnownPadChord('PadA')).toBe(true)
    expect(isKnownPadChord('PadLB')).toBe(true)
    expect(isKnownPadChord('PadLB+PadUp')).toBe(true)
    expect(isKnownPadChord('PadLB+PadLB')).toBe(false)
    expect(isKnownPadChord('PadHome')).toBe(false)
    expect(isKnownPadChord('KeyA')).toBe(false)
  })

  it('chords a press with LB held, except LB itself', () => {
    expect(padChordOf('PadUp', true)).toBe('PadLB+PadUp')
    expect(padChordOf('PadUp', false)).toBe('PadUp')
    expect(padChordOf('PadLB', true)).toBe('PadLB')
    expect(padCodeOfChord('PadLB+PadUp')).toBe('PadUp')
  })

  it('labels a chord as the pad prints it', () => {
    expect(padLabelOf('PadRS')).toBe('R-stick click')
    expect(padLabelOf('PadLB+PadB')).toBe('LB+B')
  })
})
