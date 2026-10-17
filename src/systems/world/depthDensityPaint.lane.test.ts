import { describe, expect, it } from 'vitest'
import { ECONOMY } from '../economy/economy'
import { withFreshRegistrySet } from '../registries/seal'
import { generateChunk } from './generateChunk'
import { BAND_COUNT, bandOfTile } from './planetGeometry'
import {
  bandStartsFor,
  coreRadiusFor,
  DEPTH_CURVE_ORE_RULES,
  planetParamsFor,
  type PlanetParams,
} from './planetParams'
import { CHUNK_SIZE, chunkRangeOfDisc } from './tileGrid'
import { CELL_KIND, kindOfCell } from './worldCell'

// Ticket 448 acceptance (Systems on #139, comment 6202970624 section 7.4): on radii 150, 300 and
// 1000 and an endless planet, the painted ore fraction of each band under the depth density curve
// is within 2% of the curve's band means. Band 5 of one radius-150 planet holds about five
// patches, so each radius pools a fixed seed set: 400 planets there and enough elsewhere that a
// band's pooled fraction moves by about 1% or less from one seed set to another, counted on the
// kernel's lattice before any slice folds over it. A lane: about three minutes, run when named.
const LANE_TIMEOUT_MS = 1_200_000
const TOLERANCE = 0.02
const CURVE = ECONOMY.planets.depthDensity

interface PaintedPlanets {
  label: string
  seeds: number
  /** The params of the pool's planet for one world seed. */
  paramsOf(worldSeed: number): PlanetParams
}

/** Planet 3 under the curve, at another radius: the band starts and the core follow it. */
function planet3AtRadius(worldSeed: number, radiusTiles: number): PlanetParams {
  return {
    ...planetParamsFor(worldSeed, 3, DEPTH_CURVE_ORE_RULES),
    radiusTiles,
    coreRadiusTiles: coreRadiusFor(radiusTiles),
    bandStartsHalfTileSq: bandStartsFor(radiusTiles),
  }
}

const POOLS: readonly PaintedPlanets[] = [
  { label: 'radius 150', seeds: 400, paramsOf: (seed) => planet3AtRadius(seed, 150) },
  { label: 'radius 300', seeds: 60, paramsOf: (seed) => planet3AtRadius(seed, 300) },
  { label: 'radius 1000', seeds: 6, paramsOf: (seed) => planet3AtRadius(seed, 1000) },
  {
    label: 'endless planet 200',
    seeds: 6,
    paramsOf: (seed) => planetParamsFor(seed, 200, DEPTH_CURVE_ORE_RULES),
  },
]

interface BandCounts {
  solid: number[]
  ore: number[]
}

function seedAt(at: number): number {
  return 1000 + 7919 * at
}

/** Solid (ground or ore) and ore tiles per band over every chunk of the planet. */
function countPlanet(counts: BandCounts, params: PlanetParams): void {
  const { min, max } = chunkRangeOfDisc(params.radiusTiles)
  for (let cy = min; cy <= max; cy++) {
    for (let cx = min; cx <= max; cx++) countChunk(counts, params, cx, cy)
  }
}

function countChunk(counts: BandCounts, params: PlanetParams, cx: number, cy: number): void {
  generateChunk(params, cx, cy).cells.forEach((cell, index) => {
    const kind = kindOfCell(cell)
    if (kind !== CELL_KIND.ground && kind !== CELL_KIND.ore) return
    const tx = cx * CHUNK_SIZE + (index % CHUNK_SIZE)
    const ty = cy * CHUNK_SIZE + Math.floor(index / CHUNK_SIZE)
    const band = bandOfTile(params, tx, ty)
    counts.solid[band - 1]++
    if (kind === CELL_KIND.ore) counts.ore[band - 1]++
  })
}

/** The pooled painted fraction of each band, in basis points. */
function paintedBpOf(pool: PaintedPlanets): number[] {
  const counts: BandCounts = { solid: Array(BAND_COUNT).fill(0), ore: Array(BAND_COUNT).fill(0) }
  for (let at = 0; at < pool.seeds; at++) {
    const params = pool.paramsOf(seedAt(at))
    withFreshRegistrySet(
      () => {},
      () => countPlanet(counts, params),
    )
  }
  return counts.ore.map((ore, band) => (ore * 10000) / counts.solid[band])
}

describe('depth density curve, painted (ticket 448)', () => {
  it.each(POOLS)(
    "paints each band within 2% of the curve's band means on $label",
    (pool) => {
      const painted = paintedBpOf(pool)
      const off = painted.map((bp, band) => bp / CURVE.bandMeanBp[band] - 1)
      console.log(`${pool.label}: ${off.map((share) => share.toFixed(4)).join(' ')}`)
      off.forEach((share, band) => {
        expect(Math.abs(share), `band ${band + 1}`).toBeLessThanOrEqual(TOLERANCE)
      })
    },
    LANE_TIMEOUT_MS,
  )
})
