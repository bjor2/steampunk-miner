/**
 * Which cells of a chunk show lining, by type, and what look each wears (CG2, ticket 830): a cell
 * any of whose 16 samples holds intact lining of that type. The terrain draws a refractory cell's
 * rock as firebrick with glowing joints (#113 Visibility, #114: "refractory rings look clearly
 * different"), a standard cell with the ribbed plate and rivet line of #309 GD decision 3 (ticket
 * 315, `casingLiningLook.ts`), and since ticket 830 every lined cell's plate in its grade's metal
 * with its lining type's trim, from the casing look channel (`casingLookBits.ts`): the cell's
 * highest intact grade and that sample's type, so a wall relined higher shows its newest grade
 * while the rest of the wall keeps its history. Breached lining (#111) holds no grade and shows as
 * bare rock.
 */
import { REFRACTORY_LINING_TYPE } from '../art/artIds'
import { liningTypeIndexOf } from '../vehicle/liningType'
import {
  casingTypeIndexOf,
  effectiveCasingGrade,
  STANDARD_CASING_TYPE_INDEX,
} from '../world/chunkDelta'
import { localSampleOf, sampleIndexOf, SAMPLES_PER_TILE } from '../world/sampleGrid'
import { CHUNK_CELLS, CHUNK_SIZE } from '../world/tileGrid'
import { casingLookBitsOf, NO_CASING_LOOK } from './casingLookBits'

/** 1 per cell holding each type of lining, in cell order; the look channel's value per cell. */
export interface ChunkLining {
  standard: Uint8Array
  refractory: Uint8Array
  /** `casingLookBits.ts` per cell, 0 for a cell with no intact lining. */
  look: Float32Array
}

/** No cell lined: what a chunk without lining passes. */
export const UNLINED_CHUNK: ChunkLining = {
  standard: new Uint8Array(CHUNK_CELLS),
  refractory: new Uint8Array(CHUNK_CELLS),
  look: new Float32Array(CHUNK_CELLS),
}

/** The cells of the casing layer `casing` holding standard and refractory lining, and their looks. */
export function liningCellsOf(casing: Uint8Array): ChunkLining {
  return {
    standard: cellsLinedWith(casing, STANDARD_CASING_TYPE_INDEX),
    refractory: refractoryCellsOf(casing),
    look: casingLooksOf(casing),
  }
}

/** 1 for each cell of the casing layer `casing` that holds refractory lining, in cell order. */
export function refractoryCellsOf(casing: Uint8Array): Uint8Array {
  return cellsLinedWith(casing, liningTypeIndexOf(REFRACTORY_LINING_TYPE))
}

/** The look channel's value for each cell: its strongest intact lining sample, in cell order. */
export function casingLooksOf(casing: Uint8Array): Float32Array {
  const looks = new Float32Array(CHUNK_CELLS)
  for (let index = 0; index < CHUNK_CELLS; index++) looks[index] = cellLookOf(casing, index)
  return looks
}

function cellsLinedWith(casing: Uint8Array, typeIndex: number): Uint8Array {
  const cells = new Uint8Array(CHUNK_CELLS)
  for (let index = 0; index < CHUNK_CELLS; index++) {
    if (hasLiningOfType(casing, index, typeIndex)) cells[index] = 1
  }
  return cells
}

function hasLiningOfType(casing: Uint8Array, cell: number, typeIndex: number): boolean {
  let found = false
  forEachSampleOfCell(cell, (sample) => {
    if (casingTypeIndexOf(casing[sample]) === typeIndex) found = true
  })
  return found
}

/** The highest intact grade among the cell's samples, with that sample's type; 0 for none. */
function cellLookOf(casing: Uint8Array, cell: number): number {
  let strongest = 0
  forEachSampleOfCell(cell, (sample) => {
    const typeIndex = casingTypeIndexOf(casing[sample])
    if (
      typeIndex !== null &&
      effectiveCasingGrade(casing[sample]) > effectiveCasingGrade(strongest)
    ) {
      strongest = casing[sample]
    }
  })
  const typeIndex = casingTypeIndexOf(strongest)
  return typeIndex === null
    ? NO_CASING_LOOK
    : casingLookBitsOf(effectiveCasingGrade(strongest), typeIndex)
}

function forEachSampleOfCell(cell: number, visit: (sample: number) => void): void {
  const lx = cell % CHUNK_SIZE
  const ly = Math.floor(cell / CHUNK_SIZE)
  for (let qy = 0; qy < SAMPLES_PER_TILE; qy++) {
    for (let qx = 0; qx < SAMPLES_PER_TILE; qx++) {
      visit(
        sampleIndexOf(
          localSampleOf(lx * SAMPLES_PER_TILE + qx),
          localSampleOf(ly * SAMPLES_PER_TILE + qy),
        ),
      )
    }
  }
}
