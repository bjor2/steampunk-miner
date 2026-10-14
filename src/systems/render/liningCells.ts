/**
 * Which cells of a chunk show lining, by type: a cell any of whose 16 samples holds intact lining
 * of that type. The terrain draws a refractory cell's rock as firebrick with glowing joints (#113
 * Visibility, #114: "refractory rings look clearly different"), and a standard cell with the
 * brass ribbed plate and rivet line of #309 GD decision 3 (ticket 315, `casingLiningLook.ts`).
 * Breached lining (#111) holds no grade and shows as bare rock.
 */
import { REFRACTORY_LINING_TYPE } from '../art/artIds'
import { liningTypeIndexOf } from '../vehicle/liningType'
import { casingTypeIndexOf, STANDARD_CASING_TYPE_INDEX } from '../world/chunkDelta'
import { localSampleOf, sampleIndexOf, SAMPLES_PER_TILE } from '../world/sampleGrid'
import { CHUNK_CELLS, CHUNK_SIZE } from '../world/tileGrid'

/** 1 per cell holding each type of lining, in cell order. */
export interface ChunkLining {
  standard: Uint8Array
  refractory: Uint8Array
}

/** No cell lined: what a chunk without lining passes. */
export const UNLINED_CHUNK: ChunkLining = {
  standard: new Uint8Array(CHUNK_CELLS),
  refractory: new Uint8Array(CHUNK_CELLS),
}

/** The cells of the casing layer `casing` holding standard and refractory lining. */
export function liningCellsOf(casing: Uint8Array): ChunkLining {
  return {
    standard: cellsLinedWith(casing, STANDARD_CASING_TYPE_INDEX),
    refractory: refractoryCellsOf(casing),
  }
}

/** 1 for each cell of the casing layer `casing` that holds refractory lining, in cell order. */
export function refractoryCellsOf(casing: Uint8Array): Uint8Array {
  return cellsLinedWith(casing, liningTypeIndexOf(REFRACTORY_LINING_TYPE))
}

function cellsLinedWith(casing: Uint8Array, typeIndex: number): Uint8Array {
  const cells = new Uint8Array(CHUNK_CELLS)
  for (let index = 0; index < CHUNK_CELLS; index++) {
    if (hasLiningOfType(casing, index, typeIndex)) cells[index] = 1
  }
  return cells
}

function hasLiningOfType(casing: Uint8Array, cell: number, typeIndex: number): boolean {
  const lx = cell % CHUNK_SIZE
  const ly = Math.floor(cell / CHUNK_SIZE)
  for (let qy = 0; qy < SAMPLES_PER_TILE; qy++) {
    for (let qx = 0; qx < SAMPLES_PER_TILE; qx++) {
      const sample = sampleIndexOf(
        localSampleOf(lx * SAMPLES_PER_TILE + qx),
        localSampleOf(ly * SAMPLES_PER_TILE + qy),
      )
      if (casingTypeIndexOf(casing[sample]) === typeIndex) return true
    }
  }
  return false
}
