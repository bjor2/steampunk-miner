import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import { formatPrice } from '../displayAmount'
import { requiredCasingGrade, requiredGradeOnLadder } from '../economy/casingGrades'
import { casingUnlockPrice, liningMetrePrice } from '../economy/casingPrices'
import { toCanonical } from '../money'
import { offsetStartSlice } from '../registries/casingOffsetFixtures'
import { casingGradeTextOf } from '../views/hudReadings'
import { casingBandOfTile } from './casingBand'
import { planetParamsFor, type PlanetParams } from './planetParams'
import { surfaceRowOfColumn } from './tileGrid'

// Ticket 829's goldens: the grade a cell needs, a metre of lining against it, the grade's unlock
// price and their readouts (#681), at g = 1, 2, 5, 6, 10 and 1e6, down the dock column at d = 0,
// every band edge +-1 cell and the core. Planet 1 matches main's #41 grades and prices.

const SEED = 83921
const DOCK_COLUMN = 0

/** Depths down the dock column: the surface, each band edge with the cells either side, the core. */
function goldenDepthsOf(params: PlanetParams): number[] {
  const surface = surfaceRowOfColumn(DOCK_COLUMN, params.radiusTiles)
  const bandAt = (d: number) => casingBandOfTile(params, DOCK_COLUMN, surface - d)
  const depths = new Set([0])
  for (let d = 1; d <= surface; d++) {
    if (bandAt(d) !== bandAt(d - 1)) [d - 1, d, d + 1].forEach((edge) => depths.add(edge))
  }
  return [...depths].sort((a, b) => a - b)
}

/** One golden line: depth, band, grade, a metre's price, the unlock price, and the readouts. */
function goldenLineOf(params: PlanetParams, d: number): string {
  const surface = surfaceRowOfColumn(DOCK_COLUMN, params.radiusTiles)
  const band = casingBandOfTile(params, DOCK_COLUMN, surface - d)
  const grade = requiredCasingGrade({ planetIndex: params.planetIndex, band })
  const metre = liningMetrePrice(params.planetIndex, band)
  const unlock = casingUnlockPrice(grade)
  return [
    `d${d} b${band} q${grade}`,
    `metre ${toCanonical(metre)} (${formatPrice(metre)})`,
    `unlock ${toCanonical(unlock)} (${formatPrice(unlock)})`,
    casingGradeTextOf(grade),
  ].join(' | ')
}

function goldenOf(planetIndex: number): string[] {
  const params = planetParamsFor(SEED, planetIndex)
  return goldenDepthsOf(params).map((d) => goldenLineOf(params, d))
}

describe('casing ladder goldens (ticket 829)', () => {
  it.each([1, 2, 5, 6, 10, 1_000_000])('pins planet %i down the dock column', (g) => {
    expect(goldenOf(g)).toMatchSnapshot()
  })

  it("keeps planet 1's grades and prices those of #41 and #894", () => {
    const lines = goldenOf(1)
    expect(lines[0]).toBe('d0 b1 q1 | metre 2e-1 (0.2) | unlock 0e+0 (0) | G1')
    expect(lines.at(-1)).toMatch(/b6 q5 \| metre 1\.51875e\+0 .* unlock 4\.42e\+2 \(442\) \| G5$/)
  })

  it('pins a +1 biome fixture across its edge: band 1 at the surface grade, band 2 two above', () => {
    const biome = { surfaceGrade: 21n, biomeDelta: 1 }
    expect([1, 2, 3].map((band) => requiredGradeOnLadder(biome, band))).toEqual([21n, 23n, 24n])
  })

  it('pins an offset start one over the default at d = 0 and across its band edges', () => {
    const lines = withRegistrations([offsetStartSlice(3, 1n)], () => goldenOf(3))
    expect(lines[0]).toMatch(/^d0 b1 q10 /)
    expect(lines).toMatchSnapshot()
  })
})
