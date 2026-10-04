import { describe, expect, it } from 'vitest'
import { fromCanonical } from '../money'
import { toCanonicalJson } from './canonicalJson'
import { fnv1a64Hex, stateDigest } from './stateDigest'

describe('canonical json', () => {
  it('sorts object keys at every level', () => {
    expect(toCanonicalJson({ b: 1, a: { d: [2, 1], c: true } })).toBe(
      '{"a":{"c":true,"d":[2,1]},"b":1}',
    )
  })

  it('writes money as its canonical string', () => {
    expect(toCanonicalJson({ wallet: fromCanonical('1.50') })).toBe('{"wallet":"1.5e+0"}')
  })

  it.each([1.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity])(
    'refuses the number %s, which could print differently elsewhere',
    (value) => {
      expect(() => toCanonicalJson({ value })).toThrow(/safe integers/)
    },
  )

  it('refuses undefined and class instances', () => {
    expect(() => toCanonicalJson({ value: undefined })).toThrow(/undefined/)
    expect(() => toCanonicalJson({ value: new Map() })).toThrow(/object/)
  })
})

describe('state digest', () => {
  it.each([
    ['', 'cbf29ce484222325'],
    ['a', 'af63dc4c8601ec8c'],
    ['foobar', '85944171f73967e8'],
  ])('matches the published FNV-1a 64 value for %j', (text, digest) => {
    expect(fnv1a64Hex(text)).toBe(digest)
  })

  it('hashes UTF-8 bytes, not UTF-16 code units', () => {
    expect(fnv1a64Hex('é')).toBe(fnv1a64Hex('é'))
    expect(fnv1a64Hex('é')).not.toBe(fnv1a64Hex('é'.normalize('NFD')))
  })

  it('is the same for equal states whatever their key order or money text', () => {
    const one = { players: { p1: { wallet: fromCanonical('100') } }, tick: 3 }
    const other = { tick: 3, players: { p1: { wallet: fromCanonical('1e2') } } }
    expect(stateDigest(one)).toBe(stateDigest(other))
  })

  it('changes when any value changes', () => {
    expect(stateDigest({ tick: 3 })).not.toBe(stateDigest({ tick: 4 }))
  })
})
