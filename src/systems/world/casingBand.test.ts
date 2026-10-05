import { describe, expect, it } from 'vitest'
import { casingBandOfWall } from './casingBand'
import { bandOfTile } from './planetGeometry'
import { planetParamsFor } from './planetParams'
import { SAMPLES_PER_TILE } from './sampleGrid'
import { FULL_WEIGHT, type WeightedSample } from './stampShape'

const params = planetParamsFor(83921, 1)

function wallSampleIn(tx: number, ty: number): WeightedSample {
  return { sx: tx * SAMPLES_PER_TILE, sy: ty * SAMPLES_PER_TILE, weight: FULL_WEIGHT, floor: 0 }
}

/** The first row up the x = 0 column whose band is deeper than the row above it. */
function deeperRowBelowBoundary(): number {
  let ty = 0
  while (bandOfTile(params, 0, ty + 1) === bandOfTile(params, 0, ty)) ty++
  return ty
}

describe('casing band of a lined wall', () => {
  it('prices a wall wholly inside one band at that band', () => {
    const ty = deeperRowBelowBoundary() + 1
    const wall = [wallSampleIn(0, ty + 1), wallSampleIn(0, ty + 2)]
    expect(bandOfTile(params, 0, ty + 2)).toBe(bandOfTile(params, 0, ty + 1))
    expect(casingBandOfWall(params, wall)).toBe(bandOfTile(params, 0, ty + 1))
  })

  it('prices a wall straddling a band boundary at the deeper band', () => {
    const deeper = deeperRowBelowBoundary()
    const wall = [wallSampleIn(0, deeper + 1), wallSampleIn(0, deeper)]
    expect(bandOfTile(params, 0, deeper)).toBe(bandOfTile(params, 0, deeper + 1) + 1)
    expect(casingBandOfWall(params, wall)).toBe(bandOfTile(params, 0, deeper))
  })
})
