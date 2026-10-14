import { describe, expect, it } from 'vitest'
import { createSeededRandom } from '../seededRandom'
import { decodeBase64, encodeBase64 } from './base64Text'
import { compressLz4Block, decompressLz4Block } from './lz4Block'
import { createByteReader, createByteWriter } from './wholeNumberBytes'

const bytesOf = (values: readonly number[]) => Uint8Array.from(values)

function noiseBytes(length: number, seed: number): Uint8Array {
  const random = createSeededRandom(seed)
  return Uint8Array.from({ length }, () => random.nextInt(256))
}

/** -1 for equal bytes; `toEqual` walks a large typed array far slower than this. */
function firstDifference(a: Uint8Array | null, b: Uint8Array): number {
  if (a === null || a.length !== b.length) return 0
  return a.findIndex((byte, at) => byte !== b[at])
}

/** The stamp's soft rim, repeated down a tunnel: a few values every few samples. */
function rimBytes(length: number): Uint8Array {
  const rim = [1, 159, 1, 174, 1, 206, 1, 174]
  return Uint8Array.from({ length }, (_, at) => rim[at % rim.length])
}

describe('whole-number bytes', () => {
  it('reads back every whole number up to the largest safe integer', () => {
    const values = [
      0,
      1,
      127,
      128,
      255,
      16_383,
      16_384,
      2 ** 31,
      2 ** 32 + 5,
      Number.MAX_SAFE_INTEGER,
    ]
    const writer = createByteWriter()
    values.forEach((value) => writer.writeWhole(value))
    const reader = createByteReader(writer.bytes())
    expect(values.map(() => reader.readWhole())).toEqual(values)
    expect(reader.isAtEnd()).toBe(true)
  })

  it('writes a number below 128 as one byte', () => {
    const writer = createByteWriter()
    writer.writeWholeList([0, 5, 127])
    expect(writer.bytes()).toEqual(bytesOf([3, 0, 5, 127]))
  })

  it('reads null when the bytes end inside a number or a list', () => {
    expect(createByteReader(bytesOf([200])).readWhole()).toBeNull()
    expect(createByteReader(bytesOf([3, 1, 2])).readWholeList()).toBeNull()
  })
})

describe('LZ4 block', () => {
  const inputs = {
    empty: new Uint8Array(0),
    short: bytesOf([1, 2, 3, 4, 1, 2, 3, 4, 1, 2]),
    noise: noiseBytes(70_000, 7),
    rim: rimBytes(200_000),
    'zeros past the 64 KiB window': new Uint8Array(150_000),
  }

  it.each(Object.entries(inputs))('decodes %s back to the same bytes', (_, input) => {
    expect(firstDifference(decompressLz4Block(compressLz4Block(input), input.length), input)).toBe(
      -1,
    )
  })

  it('writes a repeated rim in a small fraction of its size', () => {
    expect(compressLz4Block(rimBytes(200_000)).length).toBeLessThan(2_000)
  })

  it('grows incompressible bytes by under one percent', () => {
    expect(compressLz4Block(noiseBytes(70_000, 7)).length).toBeLessThan(70_700)
  })

  it('gives the same block for the same bytes every time', () => {
    const input = noiseBytes(5_000, 3)
    expect(firstDifference(compressLz4Block(input), compressLz4Block(input.slice()))).toBe(-1)
  })

  it('keeps the last 5 bytes as literals, as the format asks', () => {
    const block = compressLz4Block(new Uint8Array(1_000))
    expect([...block.slice(-5)]).toEqual([0, 0, 0, 0, 0])
  })

  it('refuses a block that is cut short, points before its start or decodes to another size', () => {
    const block = compressLz4Block(rimBytes(1_000))
    expect(decompressLz4Block(block.slice(0, block.length - 3), 1_000)).toBeNull()
    expect(decompressLz4Block(bytesOf([0x04, 9, 0x00, 0x05, 0x00]), 9)).toBeNull()
    expect(decompressLz4Block(block, 999)).toBeNull()
  })
})

describe('base64 text', () => {
  it.each([
    ['', ''],
    ['f', 'Zg=='],
    ['fo', 'Zm8='],
    ['foo', 'Zm9v'],
    ['foobar', 'Zm9vYmFy'],
  ])('writes %j as RFC 4648 does: %j', (plain, encoded) => {
    const bytes = bytesOf([...plain].map((char) => char.charCodeAt(0)))
    expect(encodeBase64(bytes)).toBe(encoded)
    expect(decodeBase64(encoded)).toEqual(bytes)
  })

  it('reads back a megabyte of any bytes', () => {
    const bytes = noiseBytes(1_000_001, 11)
    expect(firstDifference(decodeBase64(encodeBase64(bytes)), bytes)).toBe(-1)
  })

  it('refuses text of another alphabet, length or padding', () => {
    expect(decodeBase64('Zm9')).toBeNull()
    expect(decodeBase64('Zm!v')).toBeNull()
    expect(decodeBase64('Z===')).toBeNull()
    expect(decodeBase64('Zg==Zm9v')).toBeNull()
  })
})
