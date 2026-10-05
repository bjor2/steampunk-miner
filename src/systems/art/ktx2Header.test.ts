import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ktx2MapProblems, ktx2TileProblems, readKtx2Header } from './ktx2Header'

// Tiny files written by KTX-Software's `toktx` 4.4.2 (see docs/art-pipeline.md), so the reader is
// checked against the encoder the pipeline uses, not against bytes the test made up.
const fixture = (name: string) =>
  new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)))

describe('ktx2 header', () => {
  it('reads the size, the Basis encoding and the colour space toktx wrote', () => {
    expect(readKtx2Header(fixture('etc1s-srgb-8.ktx2'))).toEqual({
      width: 8,
      height: 8,
      encoding: 'etc1s',
      transfer: 'srgb',
    })
    expect(readKtx2Header(fixture('uastc-linear-8.ktx2'))).toEqual({
      width: 8,
      height: 8,
      encoding: 'uastc',
      transfer: 'linear',
    })
  })

  it('is no header for bytes that are not a KTX2 file', () => {
    expect(
      readKtx2Header(new TextEncoder().encode('\x89PNG not a texture at all, padded out')),
    ).toBe(null)
  })
})

describe('ktx2 map lint', () => {
  it('passes ETC1S sRGB albedo and emissive maps and a UASTC linear normal map', () => {
    expect(ktx2MapProblems('a.albedo.ktx2', 'albedo', fixture('etc1s-srgb-8.ktx2'))).toEqual([])
    expect(ktx2MapProblems('a.emissive.ktx2', 'emissive', fixture('etc1s-srgb-8.ktx2'))).toEqual([])
    expect(ktx2MapProblems('a.normal.ktx2', 'normal', fixture('uastc-linear-8.ktx2'))).toEqual([])
  })

  it('refuses a normal map in ETC1S, which is too lossy for normals', () => {
    expect(ktx2MapProblems('a.normal.ktx2', 'normal', fixture('etc1s-srgb-8.ktx2'))).toEqual([
      'a.normal.ktx2: a normal map must be uastc',
      'a.normal.ktx2: a normal map must be linear',
    ])
  })

  it('refuses an albedo map in UASTC, and a UASTC map in sRGB where linear is wanted', () => {
    expect(ktx2MapProblems('a.albedo.ktx2', 'albedo', fixture('uastc-linear-8.ktx2'))).toEqual([
      'a.albedo.ktx2: a albedo map must be etc1s',
      'a.albedo.ktx2: a albedo map must be srgb',
    ])
    expect(ktx2MapProblems('a.normal.ktx2', 'normal', fixture('uastc-srgb-8.ktx2'))).toEqual([
      'a.normal.ktx2: a normal map must be linear',
    ])
  })

  it('refuses a side that is not a power of two', () => {
    expect(ktx2MapProblems('a.albedo.ktx2', 'albedo', fixture('etc1s-srgb-12x8.ktx2'))).toEqual([
      'a.albedo.ktx2: 12x8 must be power-of-two sides up to 4096',
    ])
  })
})

describe('ktx2 tile lint', () => {
  it('refuses a ground or casing map that is not the 1024 px square tile of #52', () => {
    expect(ktx2TileProblems('g.albedo.ktx2', fixture('etc1s-srgb-8.ktx2'))).toEqual([
      'g.albedo.ktx2: a tile map must be 1024x1024 (4 m at 256 px/m), not 8x8',
    ])
    expect(ktx2TileProblems('g.albedo.ktx2', fixture('etc1s-srgb-12x8.ktx2'))).toEqual([
      'g.albedo.ktx2: a tile map must be 1024x1024 (4 m at 256 px/m), not 12x8',
    ])
  })

  it('leaves bytes that are not KTX2 to the map lint', () => {
    expect(ktx2TileProblems('g.albedo.ktx2', new TextEncoder().encode('no texture'))).toEqual([])
  })
})
