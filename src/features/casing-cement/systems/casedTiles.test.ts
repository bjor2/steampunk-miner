import { describe, expect, it } from 'vitest'
import { ECONOMY } from '../../../systems/economy/economy'
import { liningTypeIndexOf } from '../../../systems/vehicle/liningType'
import { casingValueOf, CASING_BREACHED } from '../../../systems/world/chunkDelta'
import { cementTypeIndicesOf, isTileCasedIn, type CasingSampleReader } from './casedTiles'

const REFRACTORY = liningTypeIndexOf('refractory')
const CEMENT = new Set([REFRACTORY])
const TILE = { tx: 3, ty: -2 }

/** A casing layer holding `value` at one world sample and nothing anywhere else. */
function oneSampleAt(sx: number, sy: number, value: number): CasingSampleReader {
  return (x, y) => (x === sx && y === sy ? value : 0)
}

/**
 * The border golden (GD ruling on #367): over the 8x8 samples round the tile, `#` where one
 * refractory sample cases it, `.` where it does not. The tile's own 4x4 samples and their one-sample
 * ring case it; two samples out does not.
 */
function casedPictureOf(value: number): string[] {
  const rows: string[] = []
  for (let dy = -2; dy < 6; dy++) {
    let row = ''
    for (let dx = -2; dx < 6; dx++) {
      const reader = oneSampleAt(TILE.tx * 4 + dx, TILE.ty * 4 + dy, value)
      row += isTileCasedIn(reader, TILE, CEMENT) ? '#' : '.'
    }
    rows.push(row)
  }
  return rows
}

describe('casing-cement: cased tiles', () => {
  it('cases a tile from a cement sample in it or on its one-sample border, and from nothing further', () => {
    expect(casedPictureOf(casingValueOf(1, REFRACTORY))).toEqual([
      '........',
      '.######.',
      '.######.',
      '.######.',
      '.######.',
      '.######.',
      '.######.',
      '........',
    ])
  })

  it('cases nothing from standard lining, at any grade', () => {
    expect(casedPictureOf(casingValueOf(15, 0)).join('')).not.toContain('#')
    expect(casedPictureOf(casingValueOf(1, 0)).join('')).not.toContain('#')
  })

  it('cases nothing from breached lining of either type', () => {
    expect(casedPictureOf(CASING_BREACHED).join('')).not.toContain('#')
    expect(casedPictureOf(casingValueOf(0, REFRACTORY)).join('')).not.toContain('#')
  })

  it('counts an under-grade cement sample: the grade never decides', () => {
    expect(isTileCasedIn(oneSampleAt(12, -8, casingValueOf(1, REFRACTORY)), TILE, CEMENT)).toBe(
      true,
    )
  })

  it('reads at most the 36 samples of the tile and its border', () => {
    const read = new Set<string>()
    isTileCasedIn((sx, sy) => (read.add(`${sx},${sy}`), 0), TILE, CEMENT)
    expect(read.size).toBe(36)
  })

  it('takes refractory as the only cement grade with a lining type today', () => {
    expect(cementTypeIndicesOf(ECONOMY.casing.cementGrades)).toEqual(new Set([REFRACTORY]))
  })
})
