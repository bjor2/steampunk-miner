import { describe, expect, it } from 'vitest'
import {
  FACETED_EDGE_SHARE_FLOOR,
  gemReadProblemsOf,
  heroReadOf,
  OUTLINE_CONTRAST_FLOOR,
  priceOrderProblemsOf,
  showinessOf,
  type CellScreenRead,
  type HeroReads,
} from './gemRead'
import type { ContactSheetRow, PlanetContactSheet } from './skinContactSheet'

// Ticket 785's gem-read rule (the GD addendum on #746) over synthetic measures: what a cell must
// show at both screens to read as a gem, and Systems' price-order score, k plus the cell's
// bright-or-saturated share, with a non-gem counting its share alone and a cell-less row nothing.

const READS_AS_GEM: CellScreenRead = {
  highlightCount: 2,
  facetEdgeShare: 0.4,
  outlineContrast: 2.0,
  brightOrSaturatedShare: 0.1,
}

function readOf(speciesId: string, share: number, screens: Partial<CellScreenRead> = {}) {
  const measures = { ...READS_AS_GEM, brightOrSaturatedShare: share, ...screens }
  return { speciesId, cellSha256: 'abc', screens: { '360x640': measures, '1280x800': measures } }
}

function rowOf(
  speciesId: string,
  heroCell: number | null,
  gemRank: number | null,
  gemSaleTier: number | null,
): ContactSheetRow {
  return {
    slot: 1,
    speciesId,
    name: speciesId,
    rarity: 'rare',
    silhouette: 'cubes',
    silhouetteCode: 1,
    pattern: 'zoned',
    patternCode: 1,
    colour: '#ffffff',
    heroCell,
    gemRank,
    gemSaleTier,
  }
}

function sheetOf(rows: ContactSheetRow[]): PlanetContactSheet {
  return { planetIndex: 1, rows, unskinned: [] }
}

const READS: HeroReads = {
  screens: { '360x640': 30, '1280x800': 67 },
  heroes: [readOf('cheap-gem', 0.2), readOf('dear-gem', 0.05), readOf('plain-ore', 0.3)],
}

describe('gem read (ticket 785)', () => {
  it('reads a cell as a gem when both screens show a highlight, facet edges and an outline', () => {
    expect(gemReadProblemsOf(readOf('gem', 0.1))).toEqual([])
  })

  it('names the screen where a cell shows no highlight, too few facet edges or no outline', () => {
    const dull = readOf('dull', 0.1)
    dull.screens['360x640'] = {
      highlightCount: 0,
      facetEdgeShare: FACETED_EDGE_SHARE_FLOOR / 2,
      outlineContrast: OUTLINE_CONTRAST_FLOOR - 0.1,
      brightOrSaturatedShare: 0.1,
    }
    expect(gemReadProblemsOf(dull)).toEqual([
      'dull shows no highlight at 360x640',
      `dull has ${FACETED_EDGE_SHARE_FLOOR / 2} of its body on facet edges at 360x640`,
      `dull stands only ${OUTLINE_CONTRAST_FLOOR - 0.1} off its rock at 360x640`,
    ])
  })

  it('refuses a cell measured at one screen only', () => {
    const half = { ...readOf('half', 0.1), screens: { '360x640': READS_AS_GEM } }
    expect(gemReadProblemsOf(half)).toEqual(['half has no read at 1280x800'])
  })

  it('scores a gem as its rank plus its share, a non-gem as its share, a cell-less row as nothing', () => {
    expect(showinessOf(rowOf('cheap-gem', 4, 0, 12), READS, '360x640')).toBe(0.2)
    expect(showinessOf(rowOf('dear-gem', 5, 2, 15), READS, '360x640')).toBe(2.05)
    expect(showinessOf(rowOf('plain-ore', 6, null, null), READS, '360x640')).toBe(0.3)
    expect(showinessOf(rowOf('plain-ore', null, null, null), READS, '360x640')).toBe(0)
    expect(heroReadOf(READS, 'unmeasured')).toBe(null)
  })

  it('holds price order when ranks rise with the sale tier and no gem is under the top non-gem', () => {
    const sheet = sheetOf([
      rowOf('dear-gem', 5, 1, 15),
      rowOf('cheap-gem', 4, 0, 12),
      rowOf('plain-ore', null, null, null),
    ])
    expect(priceOrderProblemsOf(sheet, READS, '360x640')).toEqual([])
  })

  it('names a cheaper gem scoring above a pricier one, and a gem under the top non-gem', () => {
    const inverted = sheetOf([
      rowOf('cheap-gem', 4, 1, 12),
      rowOf('dear-gem', 5, 0, 15),
      rowOf('plain-ore', 6, null, null),
    ])
    expect(priceOrderProblemsOf(inverted, READS, '360x640')).toEqual([
      'P1 dear-gem scores 0.05 under the cheaper cheap-gem at 360x640',
      'P1 dear-gem scores 0.05 under the top non-gem 0.3 at 360x640',
    ])
  })

  it('allows a tie between a cheaper and a pricier gem', () => {
    const tied: HeroReads = {
      ...READS,
      heroes: [readOf('cheap-gem', 0.1), readOf('dear-gem', 0.1)],
    }
    const sheet = sheetOf([rowOf('cheap-gem', 4, 0, 12), rowOf('dear-gem', 5, 0, 15)])
    expect(priceOrderProblemsOf(sheet, tied, '1280x800')).toEqual([])
  })
})
