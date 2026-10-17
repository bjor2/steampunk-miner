import { describe, expect, it } from 'vitest'
import { BAND_START_DEPTH_PERCENT, ORE_DENSITY_BP } from '../world/planetTable'
import { DEPTH_SUBSTEPS_PER_TABLE_STEP } from '../../constants/balance'
import { depthDensityBpAt } from './depthDensityCurve'
import { ECONOMY } from './economy'
import economyFile from './economy.json'
import { readEconomy } from './readEconomy'

// Ticket 448 acceptance (Systems on #139, comments 6202970624 section 7.4 and 6203159815): the
// shipped table is the formula, its band means are Systems' table, band 5 keeps 22%, the column's
// value-weighted ore stays today's and the surface is bare.
const CURVE = ECONOMY.planets.depthDensity
const DEPTH_STEPS = CURVE.tableSteps * DEPTH_SUBSTEPS_PER_TABLE_STEP
const BAND_EDGES_PERCENT = [0, ...BAND_START_DEPTH_PERCENT, 100]
/** Value per ore unit climbs one tier, x1.5, per band (`t = 3(p - 1) + b`, #6). */
const VALUE_RATIO_PER_BAND = 1.5

/** `d^0.375` as `(d^3)^(1/8)`: three square roots, exact on every engine. */
function formulaBpAt(depthFraction: number): number {
  const ramp = Math.sqrt(Math.sqrt(Math.sqrt(depthFraction * depthFraction * depthFraction)))
  return (CURVE.scaleBp * (CURVE.floorBp + (10000 - CURVE.floorBp) * ramp)) / 10000
}

/** The mean of the interpolated curve over depths `[fromPercent, toPercent)` of the radius. */
function meanBpBetween(fromPercent: number, toPercent: number): number {
  const first = Math.round((fromPercent * DEPTH_STEPS) / 100)
  const end = Math.round((toPercent * DEPTH_STEPS) / 100)
  let sum = 0
  for (let at = first; at < end; at++) sum += depthDensityBpAt(CURVE, at)
  return sum / (end - first)
}

function bandMeansBp(): number[] {
  return CURVE.bandMeanBp.map((_, band) =>
    meanBpBetween(BAND_EDGES_PERCENT[band], BAND_EDGES_PERCENT[band + 1]),
  )
}

/** Ore down one radius, each band weighted by its thickness and its value. */
function columnValueWeightedOre(densityBpByBand: readonly number[]): number {
  let weight = 1
  return densityBpByBand.reduce((sum, density, band) => {
    const thickness = BAND_EDGES_PERCENT[band + 1] - BAND_EDGES_PERCENT[band]
    const term = density * thickness * weight
    weight *= VALUE_RATIO_PER_BAND
    return sum + term
  }, 0)
}

describe('depth density curve (ticket 448)', () => {
  it('ships 257 entries that equal the formula rounded at d = i / 256', () => {
    expect(CURVE.tableSteps).toBe(256)
    expect(CURVE.tableBp).toHaveLength(257)
    expect(CURVE.gamma.toString()).toBe('0.375')
    const formula = CURVE.tableBp.map((_, at) => Math.round(formulaBpAt(at / CURVE.tableSteps)))
    expect(CURVE.tableBp).toEqual(formula)
  })

  it('reads the table entries exactly and interpolates between them, never past the ends', () => {
    const step = DEPTH_SUBSTEPS_PER_TABLE_STEP
    expect(depthDensityBpAt(CURVE, 0)).toBe(CURVE.tableBp[0])
    expect(depthDensityBpAt(CURVE, 10 * step)).toBe(CURVE.tableBp[10])
    const between = depthDensityBpAt(CURVE, 10 * step + step / 2)
    expect(between).toBe(Math.floor((CURVE.tableBp[10] + CURVE.tableBp[11]) / 2))
    expect(depthDensityBpAt(CURVE, -5)).toBe(CURVE.tableBp[0])
    expect(depthDensityBpAt(CURVE, DEPTH_STEPS + 5)).toBe(CURVE.tableBp[256])
  })

  it("keeps every band's mean within 1% of Systems' table, band 5 at 2200 bp", () => {
    const means = bandMeansBp()
    means.forEach((mean, band) => {
      const target = CURVE.bandMeanBp[band]
      expect(Math.abs(mean - target) / target, `band ${band + 1}`).toBeLessThanOrEqual(0.01)
    })
    expect(CURVE.bandMeanBp[4]).toBe(2200)
    expect(Math.abs(means[4] - 2200) / 2200).toBeLessThanOrEqual(0.01)
  })

  it("keeps the column's value-weighted ore within 0.5% of today's step bands", () => {
    const today = columnValueWeightedOre(ORE_DENSITY_BP)
    const curve = columnValueWeightedOre(bandMeansBp())
    expect(Math.abs(curve - today) / today).toBeLessThanOrEqual(0.005)
  })

  it('leaves the top 2% of the depth at 6% ore or less', () => {
    expect(meanBpBetween(0, 2)).toBeLessThanOrEqual(600)
  })

  it('starts on planet 3, so planets 1 and 2 keep the step-band rows', () => {
    expect(CURVE.fromPlanet).toBe(3)
  })

  it('refuses a table that is not tableSteps + 1 climbing basis points', () => {
    const broken = structuredClone(economyFile) as unknown as {
      planets: { depthDensity: { tableBp: number[]; scaleBp: number } }
    }
    broken.planets.depthDensity.tableBp = [300, 200]
    broken.planets.depthDensity.scaleBp = 20000
    expect(readEconomy(broken).problems).toEqual([
      'planets.depthDensity.scaleBp must be 0 to 10000',
      'planets.depthDensity.tableBp must hold tableSteps + 1 entries, tableSteps at least 1',
      'planets.depthDensity.tableBp must never fall with depth',
    ])
  })
})
