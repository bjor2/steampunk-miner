import { describe, expect, it } from 'vitest'
import { oreTypeCatalogue } from '../registries/oreTypes'
import { generateChunkCells } from './generateChunk'
import { planetParamsFor } from './planetParams'
import { chunkRangeOfDisc } from './tileGrid'
import {
  CELL_KIND,
  familyOfCell,
  kindOfCell,
  MAX_ORE_TIER_OFFSET,
  MAX_RESOURCE_FAMILY,
  oreCell,
  tierOffsetOfCell,
  type ResourceFamily,
} from './worldCell'

// The cell's 4-bit family field takes every code 0 to 15 (#232). #141's twelve families are codes
// 1 to 12 in the ores catalogue (0 is `none`), so 13 to 15 are spare: no catalogue row, never placed.

const EVERY_CODE = Array.from(
  { length: MAX_RESOURCE_FAMILY + 1 },
  (_, code) => code as ResourceFamily,
)
const FIRST_SPARE_CODE = 13
const PLANETS = [1, 2, 3, 8, 17, 25, 33, 41]

/** The family codes of every ore cell in the column of chunks through the planet's centre. */
function placedFamilyCodesOf(planetIndex: number): Set<number> {
  const params = planetParamsFor(83921, planetIndex)
  const { min, max } = chunkRangeOfDisc(params.radiusTiles)
  const codes = new Set<number>()
  for (let cy = min; cy <= max; cy++) {
    for (const cell of generateChunkCells(params, 0, cy)) {
      if (kindOfCell(cell) === CELL_KIND.ore) codes.add(familyOfCell(cell))
    }
  }
  return codes
}

describe('world cell family codes', () => {
  it('keeps every code from 0 to 15 through an ore cell, beside the largest tier offset', () => {
    const cells = EVERY_CODE.map((code) => oreCell(code, MAX_ORE_TIER_OFFSET))
    expect(cells.map(familyOfCell)).toEqual(EVERY_CODE)
    expect(cells.every((cell) => tierOffsetOfCell(cell) === MAX_ORE_TIER_OFFSET)).toBe(true)
    expect(cells.every((cell) => kindOfCell(cell) === CELL_KIND.ore)).toBe(true)
  })

  it('names code 12 as the last catalogue family and leaves 13 to 15 without a row', () => {
    const named = new Set(oreTypeCatalogue().map((ore) => ore.cellFamily))
    expect(named.has(12)).toBe(true)
    expect(EVERY_CODE.filter((code) => code >= FIRST_SPARE_CODE && named.has(code))).toEqual([])
  })

  it('never places a code the ore catalogue has no row for, on any act', () => {
    const named = new Set<number>(oreTypeCatalogue().map((ore) => ore.cellFamily))
    const placed = PLANETS.flatMap((planetIndex) => [...placedFamilyCodesOf(planetIndex)])
    expect(placed.filter((code) => !named.has(code))).toEqual([])
    expect(placed.filter((code) => code >= FIRST_SPARE_CODE)).toEqual([])
  })
})
