/**
 * Which cells of a chunk show refractory lining (#113 Visibility, #114: "refractory rings look
 * clearly different"): a cell any of whose 16 samples holds intact refractory lining. The terrain
 * draws those cells' rock as firebrick with glowing joints; standard lining is not drawn yet.
 */
import { REFRACTORY_LINING_TYPE } from '../art/artIds'
import { liningTypeIndexOf } from '../vehicle/liningType'
import { casingTypeIndexOf } from '../world/chunkDelta'
import { localSampleOf, sampleIndexOf, SAMPLES_PER_TILE } from '../world/sampleGrid'
import { CHUNK_CELLS, CHUNK_SIZE } from '../world/tileGrid'

/** 1 for each cell of the casing layer `casing` that holds refractory lining, in cell order. */
export function refractoryCellsOf(casing: Uint8Array): Uint8Array {
  const typeIndex = liningTypeIndexOf(REFRACTORY_LINING_TYPE)
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
