/**
 * Whole numbers as bytes (#401 VS2, the packed chunk table): each one a little-endian base-128
 * varint, 7 bits a byte with the top bit set on every byte but the last (the LEB128 shape). Small
 * numbers, which a chunk delta is mostly made of, take one byte. Any safe integer fits in 8 bytes,
 * written with division, never with 32-bit shifts, so nothing above 2^31 is cut.
 */

const SEVEN_BITS = 128
const LAST_BYTE_BELOW = 128
/** 8 bytes of 7 bits reach 2^56, past every safe integer. */
const MAX_VARINT_BYTES = 8
const FIRST_CAPACITY = 4096

export interface ByteWriter {
  writeWhole(value: number): void
  writeWholeList(values: readonly number[]): void
  /** The bytes written so far, as a copy. */
  bytes(): Uint8Array
}

export interface ByteReader {
  /** The next whole number, or null once the bytes run out or hold no safe integer. */
  readWhole(): number | null
  /** A count, then that many whole numbers, or null as for `readWhole`. */
  readWholeList(): number[] | null
  isAtEnd(): boolean
}

export function createByteWriter(): ByteWriter {
  let buffer: Uint8Array = new Uint8Array(FIRST_CAPACITY)
  let length = 0
  const push = (byte: number) => {
    if (length === buffer.length) buffer = grownBuffer(buffer)
    buffer[length++] = byte
  }
  const writeWhole = (value: number) => writeVarint(value, push)
  return {
    writeWhole,
    writeWholeList: (values) => {
      writeWhole(values.length)
      for (const value of values) writeWhole(value)
    },
    bytes: () => buffer.slice(0, length),
  }
}

function grownBuffer(buffer: Uint8Array): Uint8Array {
  const grown = new Uint8Array(buffer.length * 2)
  grown.set(buffer)
  return grown
}

function writeVarint(value: number, push: (byte: number) => void): void {
  let rest = value
  while (rest >= LAST_BYTE_BELOW) {
    push((rest % SEVEN_BITS) + SEVEN_BITS)
    rest = Math.floor(rest / SEVEN_BITS)
  }
  push(rest)
}

export function createByteReader(bytes: Uint8Array): ByteReader {
  let at = 0
  const readWhole = (): number | null => {
    const read = readVarint(bytes, at)
    if (read === null) return null
    at = read.next
    return read.value
  }
  return {
    readWhole,
    readWholeList: () => {
      const count = readWhole()
      if (count === null || count > bytes.length - at) return null
      return readWholes(readWhole, count)
    },
    isAtEnd: () => at === bytes.length,
  }
}

function readWholes(readWhole: () => number | null, count: number): number[] | null {
  const values = new Array<number>(count)
  for (let index = 0; index < count; index++) {
    const value = readWhole()
    if (value === null) return null
    values[index] = value
  }
  return values
}

function readVarint(bytes: Uint8Array, start: number): { value: number; next: number } | null {
  let value = 0
  let scale = 1
  for (let at = start; at < bytes.length && at - start < MAX_VARINT_BYTES; at++) {
    const byte = bytes[at]
    value += (byte % SEVEN_BITS) * scale
    if (byte < LAST_BYTE_BELOW) return Number.isSafeInteger(value) ? { value, next: at + 1 } : null
    scale *= SEVEN_BITS
  }
  return null
}
