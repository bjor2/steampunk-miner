/**
 * A PNG writer for the review sheets the scripts draw (ticket 830): 8-bit RGB, one IDAT, zlib
 * through node. No dependency, because the sheets are a few hundred kilobytes and the repo's image
 * tooling (toktx, Blender) is for shipped art, not review images.
 */
import { deflateSync } from 'node:zlib'

const SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const COLOUR_TYPE_RGB = 2
const BIT_DEPTH = 8
const CHANNELS = 3

/** `rgb` holds `width * height * 3` bytes in row order. */
export function encodePng(width: number, height: number, rgb: Uint8Array): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = BIT_DEPTH
  header[9] = COLOUR_TYPE_RGB
  return Buffer.concat([
    Buffer.from(SIGNATURE),
    chunkOf('IHDR', header),
    chunkOf('IDAT', deflateSync(filteredRowsOf(width, height, rgb))),
    chunkOf('IEND', Buffer.alloc(0)),
  ])
}

/** Each row led by filter byte 0 (none). */
function filteredRowsOf(width: number, height: number, rgb: Uint8Array): Buffer {
  const stride = width * CHANNELS
  const rows = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    rows[y * (stride + 1)] = 0
    rows.set(rgb.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1)
  }
  return rows
}

function chunkOf(type: string, body: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(body.length, 0)
  const typed = Buffer.concat([Buffer.from(type, 'latin1'), body])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32Of(typed), 0)
  return Buffer.concat([length, typed, crc])
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32Of(bytes: Buffer): number {
  let crc = 0xffffffff
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
