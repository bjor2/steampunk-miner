/**
 * Per-chunk digest (decision #4 desync repair, #36 and #41: it covers the density and the casing
 * layer too): FNV-1a 64 over the cells as little-endian uint32 bytes, then the density bytes, then
 * the casing bytes, written as 16 hex characters. Byte order is fixed explicitly, so the digest is the same on every machine whatever
 * its native endianness.
 */
import { fnv1a64HexOfBytes } from '../authority/stateDigest'

const BYTES_PER_CELL = 4
const NO_CASING_BYTES = new Uint8Array(0)

export interface ChunkContent {
  cells: Uint32Array
  density: Uint8Array
  /** Absent for a generated chunk, which has no casing; a world's chunk always passes it. */
  casing?: Uint8Array
}

export function chunkDigest(chunk: ChunkContent): string {
  return fnv1a64HexOfBytes(bytesOf(chunk))
}

function bytesOf(chunk: ChunkContent): Uint8Array {
  const cellBytes = chunk.cells.length * BYTES_PER_CELL
  const casing = chunk.casing ?? NO_CASING_BYTES
  const bytes = new Uint8Array(cellBytes + chunk.density.length + casing.length)
  const view = new DataView(bytes.buffer)
  chunk.cells.forEach((cell, index) => view.setUint32(index * BYTES_PER_CELL, cell, true))
  bytes.set(chunk.density, cellBytes)
  bytes.set(casing, cellBytes + chunk.density.length)
  return bytes
}
