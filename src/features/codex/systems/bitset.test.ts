import { describe, expect, it } from 'vitest'
import { base64OfBytes, bytesOfBase64 } from './base64Bytes'
import { bitsetOf, endsInEmptyByte, hasBit, isSubsetOf, setBitsOf, withBit } from './bitset'

const bytes = (...values: number[]) => Uint8Array.from(values)

describe('codex bitset bytes', () => {
  it('encodes bytes as the padded base64 every platform writes', () => {
    expect(base64OfBytes(bytes())).toBe('')
    expect(base64OfBytes(bytes(0x66))).toBe('Zg==')
    expect(base64OfBytes(bytes(0x66, 0x6f))).toBe('Zm8=')
    expect(base64OfBytes(bytes(0x66, 0x6f, 0x6f))).toBe('Zm9v')
    expect(base64OfBytes(bytes(0xff, 0x00, 0xfe, 0x01))).toBe('/wD+AQ==')
  })

  it('reads back every byte it wrote', () => {
    const all = Uint8Array.from({ length: 256 }, (_, at) => at)
    for (let length = 0; length <= 7; length += 1) {
      const some = all.slice(250 - length * 30, 256 - length * 30)
      expect(bytesOfBase64(base64OfBytes(some))).toEqual(some)
    }
    expect(bytesOfBase64(base64OfBytes(all))).toEqual(all)
  })

  it('refuses text that is not canonical padded base64', () => {
    for (const text of ['Zg', 'Zg=', 'Z===', 'Zh==', 'Zm9v!A==', '====', 'Zg==Zg==']) {
      expect(bytesOfBase64(text)).toBeNull()
    }
  })

  it('sets a bit once, growing the bytes only as far as that bit', () => {
    const one = withBit(bytes(), 10)
    expect(one).toEqual(bytes(0, 4))
    expect(withBit(one, 10)).toBe(one)
    expect(hasBit(one, 10)).toBe(true)
    expect(hasBit(one, 11)).toBe(false)
    expect(hasBit(one, 900)).toBe(false)
  })

  it('lists its bits ascending and rebuilds the same bytes from them', () => {
    const set = bitsetOf([17, 0, 9, 3])
    expect(setBitsOf(set)).toEqual([0, 3, 9, 17])
    expect(bitsetOf(setBitsOf(set))).toEqual(set)
    expect(endsInEmptyByte(set)).toBe(false)
    expect(endsInEmptyByte(bytes(1, 0))).toBe(true)
  })

  it('says whether one set lies inside another', () => {
    expect(isSubsetOf(bitsetOf([3]), bitsetOf([3, 12]))).toBe(true)
    expect(isSubsetOf(bitsetOf([12]), bitsetOf([3]))).toBe(false)
    expect(isSubsetOf(bytes(), bitsetOf([3]))).toBe(true)
  })
})
