import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ORE_LOOKS } from './oreFamilyLooks'
import { oreAtlasCellOf, oreAtlasCellsOf, oreAtlasCellsPerRowOf } from './oreAtlasLayout'

// The cell table of the Technical Director's budgets (#151): 256 px cells, 248 px of content,
// a 4 px gutter, 16 a row. The bake writes the same table (docs/art/ores/atlas-layout.json).

const BAKE_LAYOUT = new URL('../../../../docs/art/ores/atlas-layout.json', import.meta.url)

interface BakeCell {
  familyId: string
  variant: number
  grade: number
  index: number
  rectPx: [number, number, number, number]
}

describe('ore atlas layout', () => {
  it('lays 240 cells in family, variant, grade order, 16 a row', () => {
    const cells = oreAtlasCellsOf(ORE_LOOKS)
    expect(cells).toHaveLength(240)
    expect(oreAtlasCellsPerRowOf(ORE_LOOKS)).toBe(16)
    expect(cells[0]).toEqual({
      familyId: 'alien',
      variant: 0,
      grade: 1,
      index: 0,
      column: 0,
      row: 0,
      rectPx: [4, 4, 248, 248],
    })
    expect(cells[5]).toMatchObject({ familyId: 'alien', variant: 1, grade: 1, index: 5 })
    expect(cells[16]).toMatchObject({ column: 0, row: 1, rectPx: [4, 260, 248, 248] })
    expect(cells[239]).toMatchObject({ familyId: 'volcanic', variant: 3, grade: 5, row: 14 })
  })

  it('keeps every content rectangle inside the atlas and clear of its neighbours by the gutter', () => {
    const { sidePx, gutterPx } = ORE_LOOKS.atlas
    const cells = oreAtlasCellsOf(ORE_LOOKS)
    for (const [x, y, w, h] of cells.map((cell) => cell.rectPx)) {
      expect(x + w + gutterPx).toBeLessThanOrEqual(sidePx)
      expect(y + h + gutterPx).toBeLessThanOrEqual(sidePx)
    }
    const starts = cells.map(({ rectPx: [x, y] }) => `${x},${y}`)
    expect(new Set(starts).size).toBe(cells.length)
  })

  it('finds one look and answers null past the family, its variants or the grades', () => {
    expect(oreAtlasCellOf(ORE_LOOKS, 'crystal', 2, 4)).toMatchObject({ familyId: 'crystal' })
    expect(oreAtlasCellOf(ORE_LOOKS, 'crystal', 4, 1)).toBeNull()
    expect(oreAtlasCellOf(ORE_LOOKS, 'crystal', 0, 6)).toBeNull()
    expect(oreAtlasCellOf(ORE_LOOKS, 'brass', 0, 1)).toBeNull()
  })

  it('matches the cell table the Blender bake wrote', () => {
    const bake = JSON.parse(readFileSync(BAKE_LAYOUT, 'utf8')) as { cells: BakeCell[] }
    const ours = oreAtlasCellsOf(ORE_LOOKS).map(({ familyId, variant, grade, index, rectPx }) => ({
      familyId,
      variant,
      grade,
      index,
      rectPx,
    }))
    expect(bake.cells).toEqual(ours)
  })
})
