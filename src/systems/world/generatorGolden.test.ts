import { describe, expect, it } from 'vitest'
import { fnv1a64Hex } from '../authority/stateDigest'
import { GENERATOR_VERSION } from '../generatorVersion'
import { chunkDigest } from './chunkDigest'
import { generateChunk } from './generateChunk'
import { planetParamsFor, type PlanetParams } from './planetParams'
import { chunkRangeOfDisc } from './tileGrid'

/**
 * Decision #4 acceptance 1: a committed digest of the generator's output. If this fails, the
 * generator changed what a seed makes: bump GENERATOR_VERSION (saves and replays of the old
 * world are then refused) and update the version and digests below in the same commit.
 */
const GOLDEN = {
  generatorVersion: 1,
  wholePlanet1: 'c7b788b97138e940',
  wholePlanet2: 'd6626ceec3864939',
  farPlanetChunks: 'b44bf0f5db72d925',
}

/** One digest over every chunk's digest in a fixed order. */
function digestOfChunks(params: PlanetParams, coordinates: readonly (readonly [number, number])[]) {
  return fnv1a64Hex(
    coordinates.map(([cx, cy]) => chunkDigest(generateChunk(params, cx, cy))).join(''),
  )
}

function everyChunkOf(params: PlanetParams): [number, number][] {
  const { min, max } = chunkRangeOfDisc(params.radiusTiles)
  const chunks: [number, number][] = []
  for (let cy = min; cy <= max; cy++) {
    for (let cx = min; cx <= max; cx++) chunks.push([cx, cy])
  }
  return chunks
}

const FAR_PLANET_CHUNKS = [
  [0, 0],
  [-1, -1],
  [-32, 0],
  [5, -17],
  [-1, 31],
  [31, -32],
] as const

describe('generator golden digest', () => {
  it('is pinned to the current generator version', () => {
    expect(GENERATOR_VERSION).toBe(GOLDEN.generatorVersion)
  })

  it('makes the committed planet 1 for world seed 83921', () => {
    const params = planetParamsFor(83921, 1)
    expect(digestOfChunks(params, everyChunkOf(params))).toBe(GOLDEN.wholePlanet1)
  })

  it('makes the committed planet 2 for world seed 4000000000', () => {
    const params = planetParamsFor(4_000_000_000, 2)
    expect(digestOfChunks(params, everyChunkOf(params))).toBe(GOLDEN.wholePlanet2)
  })

  it('makes the committed chunks, negative coordinates included, on planet 2^40', () => {
    expect(digestOfChunks(planetParamsFor(1, 2 ** 40), FAR_PLANET_CHUNKS)).toBe(
      GOLDEN.farPlanetChunks,
    )
  })
})
