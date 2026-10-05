/**
 * Per-chunk digest (decision #4 desync repair, #36: the digest covers the density too): FNV-1a 64
 * over the cells as little-endian uint32 bytes followed by the density bytes, written as 16 hex
 * characters. Byte order is fixed explicitly, so the digest is the same on every machine whatever
 * its native endianness.
 */
import { fnv1a64HexOfBytes } from '../authority/stateDigest'

const BYTES_PER_CELL = 4

export interface ChunkContent {
  cells: Uint32Array
  density: Uint8Array
}

export function chunkDigest(chunk: ChunkContent): string {
  return fnv1a64HexOfBytes(bytesOf(chunk))
}

function bytesOf(chunk: ChunkContent): Uint8Array {
  const cellBytes = chunk.cells.length * BYTES_PER_CELL
  const bytes = new Uint8Array(cellBytes + chunk.density.length)
  const view = new DataView(bytes.buffer)
  chunk.cells.forEach((cell, index) => view.setUint32(index * BYTES_PER_CELL, cell, true))
  bytes.set(chunk.density, cellBytes)
  return bytes
}
