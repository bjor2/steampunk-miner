import { describe, expect, it } from 'vitest'
import { hardnessOfTile } from '../authority/groundDrill'
import { planetParamsOf } from '../authority/planetOfState'
import { div, fromCanonical, toCanonical } from '../money'
import { bandRockHardnessAt } from '../vehicle/nominalGround'
import { generateChunkCells } from '../world/generateChunk'
import { GROUND_CELL } from '../world/worldCell'
import {
  freshPlanetParamsFor,
  isSameGeneratedPlanet,
  oreRulesVersionOnEntry,
  planetParamsFor,
} from '../world/planetParams'
import { campaignIndex, planetIndexOfCampaign } from './campaignIndex'
import { planetSeedAt } from './planetAddressSeed'
import { isPlanetOfSystem, planetParamsAt, systemOfParams } from './systemPlanetParams'

const WORLD_SEED = 83921

/** A tile of band 1 a dozen cells under the surface, below the pinned surface layer. */
function bandOneTileOf(radiusTiles: number) {
  return { tx: 0, ty: radiusTiles - 12 }
}

function freshParamsAt(system: bigint, place: bigint) {
  const index = planetIndexOfCampaign(campaignIndex(system, place))
  return planetParamsAt(WORLD_SEED, system, index, oreRulesVersionOnEntry(index))
}

describe('planets of later solar systems (ticket 759)', () => {
  it('generates system 1 exactly as before, with no system key', () => {
    for (const planet of [1, 2, 5, 6, 40]) {
      const version = oreRulesVersionOnEntry(planet)
      expect(planetParamsAt(WORLD_SEED, 1n, planet, version)).toEqual(
        freshPlanetParamsFor(WORLD_SEED, planet),
      )
      expect('system' in planetParamsAt(WORLD_SEED, 1n, planet, version)).toBe(false)
    }
  })

  it("seeds a later system's planet from its address, beside system 1's planet of the same g", () => {
    const later = freshParamsAt(2n, 1n)
    const sameIndex = freshPlanetParamsFor(WORLD_SEED, 6)
    expect(later.planetSeed).toBe(planetSeedAt(WORLD_SEED, 2n, 1n))
    expect(later.planetSeed).not.toBe(sameIndex.planetSeed)
    expect({ ...later, planetSeed: sameIndex.planetSeed, system: undefined }).toEqual({
      ...sameIndex,
      system: undefined,
    })
    expect(isSameGeneratedPlanet(later, sameIndex)).toBe(false)
    expect(systemOfParams(later)).toBe(2n)
  })

  it('generates other cells there than on system 1 at the same campaign index', () => {
    const later = generateChunkCells(freshParamsAt(2n, 1n), 0, 8)
    const sameIndex = generateChunkCells(freshPlanetParamsFor(WORLD_SEED, 6), 0, 8)
    expect(later).toHaveLength(sameIndex.length)
    expect(later).not.toEqual(sameIndex)
  })

  it('seeds each system of the VS grid from its own address, finite and the same twice', () => {
    for (const system of [2n, 10n, 1000000n]) {
      const params = freshParamsAt(system, 1n)
      expect(params.planetSeed).toBe(planetSeedAt(WORLD_SEED, system, 1n))
      expect(freshParamsAt(system, 1n)).toEqual(params)
    }
  })

  it('holds only the campaign indexes past the systems before it', () => {
    expect(isPlanetOfSystem(2n, 5)).toBe(false)
    expect(isPlanetOfSystem(2n, 6)).toBe(true)
    expect(() => planetParamsAt(WORLD_SEED, 2n, 5)).toThrow(RangeError)
  })

  it("digs the later system's ground k_jump harder, cell and nominal ground alike", () => {
    const later = freshParamsAt(2n, 1n)
    const sameIndex = freshPlanetParamsFor(WORLD_SEED, 6)
    const tile = bandOneTileOf(sameIndex.radiusTiles)
    const ratio = div(
      hardnessOfTile(later, tile, GROUND_CELL),
      hardnessOfTile(sameIndex, tile, GROUND_CELL),
    )
    expect(toCanonical(ratio)).toBe(toCanonical(fromCanonical('1.1')))
    const nominal = div(bandRockHardnessAt(later, tile), bandRockHardnessAt(sameIndex, tile))
    expect(toCanonical(nominal)).toBe(toCanonical(fromCanonical('1.1')))
  })

  it('gives a session planet of system 2 a world, and only at an index the system holds', () => {
    const planet = { index: 6, seed: WORLD_SEED, system: '2' }
    expect(planetParamsOf(planet)?.planetSeed).toBe(planetSeedAt(WORLD_SEED, 2n, 1n))
    expect(planetParamsOf({ ...planet, index: 5 })).toBeNull()
    expect(planetParamsOf({ index: 6, seed: WORLD_SEED })).toEqual(planetParamsFor(WORLD_SEED, 6))
  })
})
