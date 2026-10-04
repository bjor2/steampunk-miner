/**
 * Per-chunk digest (decision #4 desync repair, #11 state digest): FNV-1a 64 over the cells as
 * little-endian uint32 bytes, written as 16 hex characters. Byte order is fixed explicitly, so the
 * digest is the same on every machine whatever its native endianness.
 */
import { fnv1a64HexOfBytes } from '../authority/stateDigest'

const BYTES_PER_CELL = 4

export function chunkDigest(cells: Uint32Array): string {
  return fnv1a64HexOfBytes(littleEndianBytesOf(cells))
}

function littleEndianBytesOf(cells: Uint32Array): Uint8Array {
  const bytes = new Uint8Array(cells.length * BYTES_PER_CELL)
  const view = new DataView(bytes.buffer)
  cells.forEach((cell, index) => view.setUint32(index * BYTES_PER_CELL, cell, true))
  return bytes
}
