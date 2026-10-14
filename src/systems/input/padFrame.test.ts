import { describe, expect, it } from 'vitest'
import {
  isPadInputHeld,
  padInputValueOf,
  padReadingProblems,
  readPadAimInto,
  type PadReading,
} from './padFrame'

function padWith(buttons: Record<number, number>, axes: readonly number[] = [0, 0, 0, 0]) {
  const values = Array.from({ length: 17 }, (_, index) => ({ value: buttons[index] ?? 0 }))
  return { buttons: values, axes } satisfies PadReading
}

describe('pad frame', () => {
  it('reads a button by its value and a stick direction by its signed axis', () => {
    const pad = padWith({ 7: 0.8 }, [-0.9, 0.2, 0, 0])
    expect(padInputValueOf(pad, { kind: 'button', index: 7 })).toBe(0.8)
    expect(padInputValueOf(pad, { kind: 'axis', index: 0, sign: -1 })).toBe(0.9)
    expect(padInputValueOf(pad, { kind: 'axis', index: 0, sign: 1 })).toBe(0)
  })

  it('reads a button or axis the pad lacks as not pushed', () => {
    const pad = { buttons: [], axes: [] }
    expect(padInputValueOf(pad, { kind: 'button', index: 11 })).toBe(0)
    expect(padInputValueOf(pad, { kind: 'axis', index: 1, sign: 1 })).toBe(0)
  })

  it('presses at half travel and lets go only well below it, so a resting stick never chatters', () => {
    expect(isPadInputHeld(0.45, false)).toBe(false)
    expect(isPadInputHeld(0.5, false)).toBe(true)
    expect(isPadInputHeld(0.45, true)).toBe(true)
    expect(isPadInputHeld(0.3, true)).toBe(false)
  })

  it('aims with the right stick in screen directions, x right and y down', () => {
    const aim = { x: 0, y: 0 }
    expect(readPadAimInto(padWith({}, [0, 0, -0.6, 0.7]), aim)).toBe(true)
    expect(aim).toEqual({ x: -0.6, y: 0.7 })
  })

  it('leaves the stick idle inside the deadzone', () => {
    const aim = { x: 0, y: 0 }
    expect(readPadAimInto(padWith({}, [0, 0, 0.1, -0.15]), aim)).toBe(false)
  })
})

describe('pad frame: the debug reading', () => {
  it('takes a pad as the browser reports it', () => {
    expect(padReadingProblems(padWith({ 0: 1 }, [0, 0, 0.5, -1]))).toEqual([])
  })

  it('lists every problem of a broken frame', () => {
    expect(padReadingProblems({ buttons: [{ value: 2 }], axes: ['left'] })).toEqual([
      'buttons must be a list of { value } from 0 to 1',
      'axes must be numbers from -1 to 1',
    ])
    expect(padReadingProblems(null)).toEqual(['a pad frame is { buttons, axes }'])
  })
})
