/**
 * The casing grade contact sheet (CG2, ticket 830; Progression's row in the GD lock on casing
 * grades by depth: "a crop diff of neighbouring grades at 24 px"): every grade from 1 to the first
 * with full pips, plus the four lining type trims, each drawn as the shader's rule in TS draws it
 * (`casingLiningCrop.ts`) over band 1's light rock and band 5's dark rock of planet 1, at the phone
 * cell size (24 px) enlarged 8x with no smoothing, and in grey (Rec. 601 luma, #13's readability
 * bar). Beside it the review size, 96 px a cell. The sheet is for review by eye; the test that
 * fails a matching pair is `casingLiningLook.test.ts`.
 *
 *   npm run casing:sheet
 *
 * writes `docs/art/casing-grades/grades.phone.png`, `grades.phone-gray.png` and `grades.review.png`.
 */
import { writeFileSync } from 'node:fs'
import { bandColourOf, paletteOf } from '../src/systems/render/bandPalette'
import { CASING_GRADE_LOOKS, firstGradeWithFullPips } from '../src/systems/render/casingGradeLook'
import { liningCropAt } from '../src/systems/render/casingLiningCrop'
import { liningLookOf } from '../src/systems/render/casingLiningLook'
import { lumaOf, type Rgb } from '../src/systems/render/colour'
import { encodePng } from './art/png'

const OUT_DIR = new URL('../docs/art/casing-grades/', import.meta.url)
const PHONE_CELL_PX = 24
const REVIEW_CELL_PX = 96
const ENLARGE = 8
/** Grades 1 to the first with full pips: every plate, every finish and every pip count. */
const GRADES = Array.from({ length: firstGradeWithFullPips() }, (_, at) => at + 1)
const TRIM_GRADE = 3
/** A lap of the finish cycle a row: the plates, then the same plates in the next finish. */
const CELLS_PER_ROW = CASING_GRADE_LOOKS.plates.length * CASING_GRADE_LOOKS.finishes.length
const GAP_PX = 2
const GAP_COLOUR: Rgb = [0.07, 0.05, 0.05]

interface Sheet {
  width: number
  height: number
  pixels: Rgb[]
}

function rocks(): Rgb[] {
  const palette = paletteOf('palette.planet_1')
  return [bandColourOf(palette, 1), bandColourOf(palette, 5)]
}

/** One lap of plates and finishes a row, the trims after the last grade; one block of rows per rock. */
function rowsOf(rock: Rgb, cellPx: number): Rgb[][][] {
  const grades = GRADES.map((grade) => liningCropAt(cellPx, rock, liningLookOf(grade, 'standard')))
  const trims = Object.keys(CASING_GRADE_LOOKS.trims).map((type) =>
    liningCropAt(cellPx, rock, liningLookOf(TRIM_GRADE, type)),
  )
  const cells = [...grades, ...trims]
  const rows: Rgb[][][] = []
  for (let from = 0; from < cells.length; from += CELLS_PER_ROW) {
    rows.push(cells.slice(from, from + CELLS_PER_ROW))
  }
  return rows
}

function sheetOf(cellPx: number, scale: number): Sheet {
  const rows = rocks().flatMap((rock) => rowsOf(rock, cellPx))
  const cell = cellPx * scale
  const width = CELLS_PER_ROW * (cell + GAP_PX) + GAP_PX
  const height = rows.length * (cell + GAP_PX) + GAP_PX
  const pixels: Rgb[] = Array.from({ length: width * height }, () => GAP_COLOUR)
  rows.forEach((row, rowAt) =>
    row.forEach((crop, cellAt) => blit(pixels, width, crop, cellPx, scale, cellAt, rowAt)),
  )
  return { width, height, pixels }
}

function blit(
  pixels: Rgb[],
  width: number,
  crop: readonly Rgb[],
  cellPx: number,
  scale: number,
  cellAt: number,
  rowAt: number,
): void {
  const cell = cellPx * scale
  const left = GAP_PX + cellAt * (cell + GAP_PX)
  const top = GAP_PX + rowAt * (cell + GAP_PX)
  for (let y = 0; y < cell; y++) {
    for (let x = 0; x < cell; x++) {
      const source = crop[Math.floor(y / scale) * cellPx + Math.floor(x / scale)]
      pixels[(top + y) * width + left + x] = source
    }
  }
}

function greyOf(sheet: Sheet): Sheet {
  return {
    ...sheet,
    pixels: sheet.pixels.map((pixel) => {
      const luma = lumaOf(pixel)
      return [luma, luma, luma] as const
    }),
  }
}

function writeSheet(name: string, sheet: Sheet): void {
  const bytes = new Uint8Array(sheet.width * sheet.height * 3)
  sheet.pixels.forEach((pixel, at) => {
    bytes[at * 3] = Math.round(pixel[0] * 255)
    bytes[at * 3 + 1] = Math.round(pixel[1] * 255)
    bytes[at * 3 + 2] = Math.round(pixel[2] * 255)
  })
  writeFileSync(new URL(name, OUT_DIR), encodePng(sheet.width, sheet.height, bytes))
  console.log(`wrote ${name} (${sheet.width}x${sheet.height})`)
}

const phone = sheetOf(PHONE_CELL_PX, ENLARGE)
writeSheet('grades.phone.png', phone)
writeSheet('grades.phone-gray.png', greyOf(phone))
writeSheet('grades.review.png', sheetOf(REVIEW_CELL_PX, 1))
console.log(
  `cells: grades ${GRADES[0]}-${GRADES[GRADES.length - 1]} in rows of ${CELLS_PER_ROW}, then grade ${TRIM_GRADE} in ${Object.keys(CASING_GRADE_LOOKS.trims).join(', ')}; the first rows over planet 1 band 1 rock, then the same over band 5 rock`,
)
