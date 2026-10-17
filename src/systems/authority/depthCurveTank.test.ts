import { describe, expect, it } from 'vitest'
import { BASIS_POINTS } from '../../constants/balance'
import { blockHardness } from '../economy/oreEconomy'
import { onCurveSteps, vehicleStatsAt } from '../economy/vehicleStats'
import { subStepsPerTile } from '../vehicle/drillRule'
import { BAND_COUNT } from '../world/planetGeometry'
import { DEPTH_CURVE_ORE_RULES, planetParamsFor } from '../world/planetParams'
import { ORE_DENSITY_BP } from '../world/planetTable'
import { cellDigEnergyOf } from './cellDigEnergy'

// Ticket 448 (Systems on #139, comment 6203133480 section 2 and 6203159815 item 4): the tank rule
// of #396, `tank = 1.25 x max over bands of (cells to fill the hold in band b x H_b)`, priced with
// the game's own per-cell energy (the swept cut's charge, `cellDigEnergyOf`) for the on-curve rig
// and hold. Under the depth density curve band 1 needs the most cells and becomes the worst band;
// the tank the rule gives on today's step bands, which the tank rows are not retuned from, must
// still hold at least 1.10 times the new worst need, so energy never ends a band-1 hold, P3 to P40
// and headless at P200. The shipped boiler rows are not that tank: they grow linearly, and on the
// on-curve rig they fall short of a full band-1 hold from about P10 under the curve (P20 on the step
// bands). Whether the rule is applied to the rows is the Vertical Scaler's call, so nothing here
// pins them.
const TANK_RULE_MARGIN = 1.25
const MARGIN_FLOOR = 1.1
const WORLD_SEED = 83921
const PLANETS = [...Array.from({ length: 38 }, (_, at) => at + 3), 200]
const BANDS = Array.from({ length: BAND_COUNT }, (_, at) => at + 1)

/** Quanta the on-curve drill burns to break one plain cell of each band. */
function cellEnergyByBand(planetIndex: number): number[] {
  const drill = vehicleStatsAt(onCurveSteps(planetIndex))
  return BANDS.map((band) => {
    const subSteps = subStepsPerTile(drill, blockHardness(planetIndex, band))
    if (subSteps === null) throw new Error(`the on-curve tip cannot scratch band ${band}`)
    return cellDigEnergyOf(subSteps)
  })
}

/** Quanta to fill the on-curve hold in each band: the cells it takes times each cell's energy. */
function holdFillQuantaByBand(planetIndex: number, densityBp: readonly number[]): number[] {
  const hold = vehicleStatsAt(onCurveSteps(planetIndex)).cargoCapacity
  return cellEnergyByBand(planetIndex).map((quanta, at) => {
    const cells = Math.ceil((hold * BASIS_POINTS) / densityBp[at])
    return cells * quanta
  })
}

function curveDensityBp(planetIndex: number): readonly number[] {
  return planetParamsFor(WORLD_SEED, planetIndex, DEPTH_CURVE_ORE_RULES).oreDensityBp
}

describe('the tank rule under the depth density curve (ticket 448)', () => {
  it.each(PLANETS)('makes band 1 the worst band to fill a hold in on planet %i', (planetIndex) => {
    const needs = holdFillQuantaByBand(planetIndex, curveDensityBp(planetIndex))
    expect(needs.indexOf(Math.max(...needs)) + 1).toBe(1)
  })

  it.each(PLANETS)(
    "keeps today's rule tank at least 1.10 times the worst new hold on planet %i",
    (planetIndex) => {
      const today = holdFillQuantaByBand(planetIndex, ORE_DENSITY_BP)
      const tankToday = TANK_RULE_MARGIN * Math.max(...today)
      const needNew = Math.max(...holdFillQuantaByBand(planetIndex, curveDensityBp(planetIndex)))
      expect(tankToday / needNew).toBeGreaterThanOrEqual(MARGIN_FLOOR)
    },
  )
})
