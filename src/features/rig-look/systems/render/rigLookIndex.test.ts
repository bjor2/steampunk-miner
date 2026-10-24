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

/** Bands of 10 purchases, a decade every 25, three authored steps on the first edges. */
const ROWS: TrackLookRows = {
  track: 'drill_tip',
  slot: 'drill.head',
  glowSlots: [['drill-bit']],
  glowCap: 'drillNose',
  steps: [10, 20, 30].map((from) => ({
    from,
    part: null,
    card: null,
    colour: '#102030',
    glows: [0],
  })),
  band: {
    decadeStep: 25,
    twoPlanetBuys: 10,
    step: 10,
    edges: [10, 20, 30, 40, 50],
    finishes: ['a', 'b', 'c'],
  },
}

const IMPORT_SPECIFIER = /(?:from|import)\s*\(?\s*'([^']*)'/g

describe('rig look index', () => {
  it('shows the base look below the first edge', () => {
    expect([0, 1, 9].map((n) => rigLookIndexOf(ROWS, n))).toEqual([
      { band: 0, step: 0, tail: 0, pips: 0 },
      { band: 0, step: 0, tail: 0, pips: 0 },
      { band: 0, step: 0, tail: 0, pips: 0 },
    ])
  })

  it('counts the authored steps reached and holds each until the next edge', () => {
    expect([10, 19, 20, 39].map((n) => rigLookIndexOf(ROWS, n).step)).toEqual([1, 1, 2, 3])
  })

  it('walks one finish band per step past the art, the edges and the tail alike', () => {
    expect([40, 49, 50, 60, 1000].map((n) => rigLookIndexOf(ROWS, n))).toEqual([
      { band: 4, step: 3, tail: 1, pips: 1 },
      { band: 4, step: 3, tail: 1, pips: 1 },
      { band: 5, step: 3, tail: 2, pips: 2 },
      { band: 6, step: 3, tail: 3, pips: 2 },
      { band: 100, step: 3, tail: 97, pips: 40 },
    ])
  })

  it('shows no pips on an authored band', () => {
    expect([10, 20, 39].map((n) => rigLookIndexOf(ROWS, n).pips)).toEqual([0, 0, 0])
  })

  it('reads NaN, negatives and fractions as whole counts from 0', () => {
    expect([Number.NaN, -1, -Infinity, 10.9].map(lookPurchasesOf)).toEqual([0, 0, 0, 10])
  })

  it('reads any count past 2^31 - 1 as 2^31 - 1', () => {
    expect(lookPurchasesOf(Infinity)).toBe(LARGEST_LOOK_PURCHASES)
    expect(rigLookIndexOf(ROWS, 2 ** 40)).toEqual(rigLookIndexOf(ROWS, LARGEST_LOOK_PURCHASES))
    expect(rigLookIndexOf(ROWS, LARGEST_LOOK_PURCHASES).band).toBe(214748364)
  })

  it('never steps down, in band or pips, as the purchases rise, on every shipped track', () => {
    for (const rows of RIG_LOOK_TABLE.tracks) {
      let before = rigLookIndexOf(rows, 0)
      for (let n = 1; n <= 10_000; n++) {
        const now = rigLookIndexOf(rows, n)
        expect(now.band).toBeGreaterThanOrEqual(before.band)
        expect(now.pips).toBeGreaterThanOrEqual(before.pips)
        before = now
      }
    }
  })

  it('reads only the rows and the count: its rule imports no state, stat, price or planet', () => {
    const imports = ['rigLookIndex.ts', 'rigLookFrames.ts', 'rigLookBands.ts'].flatMap((file) =>
      [...readFileSync(join(__dirname, file), 'utf8').matchAll(IMPORT_SPECIFIER)].map((m) => m[1]),
    )
    expect(new Set(imports)).toEqual(new Set(['./rigLookIndex', './rigLookBands']))
  })
})
