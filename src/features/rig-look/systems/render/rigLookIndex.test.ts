import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RIG_LOOK_TABLE } from '../rigLookTable'
import {
  LARGEST_LOOK_PURCHASES,
  lookPurchasesOf,
  rigLookIndexOf,
  type TrackLookRows,
} from './rigLookIndex'

const ROWS: TrackLookRows = {
  track: 'drill_tip',
  slot: 'drill.head',
  glowSlots: [['drill-bit']],
  glowCap: 'drillNose',
  steps: [10, 20, 40].map((from) => ({
    from,
    part: null,
    card: null,
    colour: '#102030',
    glows: [0],
  })),
  tail: { delta: 1, palette: ['#000001', '#000002'], plating: ['a', 'b'], glow: [[0], [1]] },
}

const IMPORT_SPECIFIER = /(?:from|import)\s*\(?\s*'([^']*)'/g

describe('rig look index', () => {
  it('shows the base look below the first step', () => {
    expect([0, 1, 9].map((n) => rigLookIndexOf(ROWS, n))).toEqual([
      { step: 0, tail: 0 },
      { step: 0, tail: 0 },
      { step: 0, tail: 0 },
    ])
  })

  it('counts the steps reached and holds each until the next', () => {
    expect([10, 19, 20, 39].map((n) => rigLookIndexOf(ROWS, n).step)).toEqual([1, 1, 2, 2])
  })

  it('walks one tail step per purchase from the top step on', () => {
    expect([40, 41, 140].map((n) => rigLookIndexOf(ROWS, n))).toEqual([
      { step: 3, tail: 0 },
      { step: 3, tail: 1 },
      { step: 3, tail: 100 },
    ])
  })

  it('walks one tail step per delta purchases', () => {
    const rows = { ...ROWS, tail: { ...ROWS.tail, delta: 3 } }
    expect([42, 43, 46].map((n) => rigLookIndexOf(rows, n).tail)).toEqual([0, 1, 2])
  })

  it('reads NaN, negatives and fractions as whole counts from 0', () => {
    expect([Number.NaN, -1, -Infinity, 10.9].map(lookPurchasesOf)).toEqual([0, 0, 0, 10])
  })

  it('reads any count past 2^31 - 1 as 2^31 - 1', () => {
    expect(lookPurchasesOf(Infinity)).toBe(LARGEST_LOOK_PURCHASES)
    expect(rigLookIndexOf(ROWS, 2 ** 40)).toEqual(rigLookIndexOf(ROWS, LARGEST_LOOK_PURCHASES))
    expect(rigLookIndexOf(ROWS, LARGEST_LOOK_PURCHASES).tail).toBe(LARGEST_LOOK_PURCHASES - 40)
  })

  it('never steps down as the purchases rise, on every shipped track', () => {
    for (const rows of RIG_LOOK_TABLE.tracks) {
      let before = rigLookIndexOf(rows, 0)
      for (let n = 1; n <= 10_000; n++) {
        const now = rigLookIndexOf(rows, n)
        expect(now.step * 1e6 + now.tail).toBeGreaterThanOrEqual(before.step * 1e6 + before.tail)
        before = now
      }
    }
  })

  it('reads only the rows and the count: its rule imports no state, stat, price or planet', () => {
    const imports = ['rigLookIndex.ts', 'rigLookFrames.ts'].flatMap((file) =>
      [...readFileSync(join(__dirname, file), 'utf8').matchAll(IMPORT_SPECIFIER)].map((m) => m[1]),
    )
    expect(imports.filter((specifier) => specifier !== './rigLookIndex')).toEqual([])
  })
})
