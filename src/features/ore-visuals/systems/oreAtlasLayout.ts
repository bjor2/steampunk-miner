/**
 * Where a family's variant sits at each grade in the ore atlases (#151 budgets, Technical
 * Director): one 256 px cell per look, 248 px of baked content inside a 4 px gutter, 16 cells a
 * row in a 4096 atlas. Families run in id order, then variant, then grade, so the albedo, normal
 * and emissive atlases share one cell table (an emissive cell below `emissiveFromGrade` is empty).
 * The bake (docs/art/ores/atlas_layout.py) writes the same table; a spec pins the two together.
 */
import { ORE_GRADE_COUNT, type OreLooks } from './oreFamilyLooks'

export interface OreAtlasCell {
  familyId: string
  variant: number
  grade: number
  index: number
  column: number
  row: number
  /** The content rectangle in atlas pixels from the top-left: x, y, width, height. */
  rectPx: readonly [number, number, number, number]
}

/** Every cell the atlas holds, in cell order. */
export function oreAtlasCellsOf(looks: OreLooks): OreAtlasCell[] {
  const cells: OreAtlasCell[] = []
  looks.families.forEach((family) => {
    for (let variant = 0; variant < family.variants; variant++) {
      for (let grade = 1; grade <= ORE_GRADE_COUNT; grade++) {
        cells.push(cellAt(looks, cells.length, family.id, variant, grade))
      }
    }
  })
  return cells
}

/** The cell of one look, or null for a family, variant or grade the atlas has no cell for. */
export function oreAtlasCellOf(
  looks: OreLooks,
  familyId: string,
  variant: number,
  grade: number,
): OreAtlasCell | null {
  return (
    oreAtlasCellsOf(looks).find(
      (cell) => cell.familyId === familyId && cell.variant === variant && cell.grade === grade,
    ) ?? null
  )
}

export function oreAtlasCellsPerRowOf(looks: OreLooks): number {
  return Math.floor(looks.atlas.sidePx / looks.atlas.cellPx)
}

function cellAt(
  looks: OreLooks,
  index: number,
  familyId: string,
  variant: number,
  grade: number,
): OreAtlasCell {
  const { cellPx, contentPx, gutterPx } = looks.atlas
  const perRow = oreAtlasCellsPerRowOf(looks)
  const column = index % perRow
  const row = Math.floor(index / perRow)
  return {
    familyId,
    variant,
    grade,
    index,
    column,
    row,
    rectPx: [column * cellPx + gutterPx, row * cellPx + gutterPx, contentPx, contentPx],
  }
}
