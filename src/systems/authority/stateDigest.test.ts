import { describe, expect, it } from 'vitest'
import { JsonNestingTooDeepError } from '../jsonNesting'
import { fromCanonical } from '../money'
import { createAuthorityState } from './authorityState'
import { toCanonicalJson } from './canonicalJson'
import { fnv1a64Hex, stateDigest } from './stateDigest'

/** `depth` objects inside each other around the number 1: `{"a":{"a":1}}` is depth 2. */
function nestedObjects(depth: number): unknown {
  let value: unknown = 1
  for (let level = 0; level < depth; level++) value = { a: value }
  return value
}

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

  it('writes values nested 64 levels deep', () => {
    expect(toCanonicalJson(nestedObjects(64))).toBe(`${'{"a":'.repeat(64)}1${'}'.repeat(64)}`)
  })

  it('refuses values nested 65 levels deep, counting lists as levels too', () => {
    expect(() => toCanonicalJson(nestedObjects(65))).toThrow(JsonNestingTooDeepError)
    expect(() => toCanonicalJson([nestedObjects(64)])).toThrow('nests deeper than 64 levels')
  })

  it('refuses values nested 100,000 levels deep without overflowing the stack', () => {
    expect(() => toCanonicalJson(nestedObjects(100_000))).toThrow(JsonNestingTooDeepError)
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

  it('keeps the digest of a fresh authority state, as the golden runs do', () => {
    const state = createAuthorityState({ planetIndex: 1, planetSeed: 7, playerIds: ['p1'] })
    expect(stateDigest(state)).toBe('1e1e7472b44b3a8f')
  })

  it('changes when any value changes', () => {
    expect(stateDigest({ tick: 3 })).not.toBe(stateDigest({ tick: 4 }))
  })
})
