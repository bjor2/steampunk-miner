import { describe, expect, it } from 'vitest'
import { DRILL_SUBSTEPS_PER_TICK } from '../../constants/balance'
import { createSeededRandom } from '../seededRandom'
import {
  carveDisc,
  carveDiscWithCells,
  walkStampInRows,
  type CarveWindow,
  type CellDrillTicks,
} from './groundEdit'
import { planetParamsFor } from './planetParams'
import { chargingByDwell, dwellRemovalOf, type SampleDwell } from './rimDwell'
import { chunkOfSample, localSampleOf, sampleIndexOf } from './sampleGrid'
import {
  cellSamplesBesideDisc,
  discSamplesOf,
  discWeightAt,
  FULL_WEIGHT,
  type DiscStamp,
} from './stampShape'
import { currentDensityOfChunk, EMPTY_WORLD, type WorldState } from './worldState'

// The swept cut's rim dwell (ticket 441): a sample is charged the work spent while the stamp's
// centre stood within its radius, on the tick clock the whole-tick carve keeps.

const params = planetParamsFor(83921, 1)
const Q = DRILL_SUBSTEPS_PER_TICK

/** A stamp 20 m under planet 1's surface, in band-1 rock. */
function discAt(xMm: number, tailXMm = xMm): DiscStamp {
  return {
    xMm,
    yMm: 280_300,
    radiusMm: 950,
    floorRadiusMm: null,
    tail: { xMm: tailXMm, yMm: 280_300 },
  }
}

function densityAt(world: WorldState, sx: number, sy: number): number {
  const density = currentDensityOfChunk(world, params, chunkOfSample(sx), chunkOfSample(sy))
  return density[sampleIndexOf(localSampleOf(sx), localSampleOf(sy))]
}

/** One station spending a whole tick at each sample's own weight in `disc`. */
function wholeTickAtOwnWeight(disc: DiscStamp): SampleDwell {
  const weights = new Map(discSamplesOf(disc).map(({ sx, sy, weight }) => [`${sx},${sy}`, weight]))
  return (sx, sy) => Q * (weights.get(`${sx},${sy}`) ?? 0)
}

const subStepWindow = (firstTick: number): CarveWindow => ({
  firstTick,
  ticks: 1,
  subStepsPerTick: Q,
})

describe('rim dwell charge (ticket 441)', () => {
  it("removes exactly the whole-tick carve when one station spends a whole tick at the sample's own weight", () => {
    const random = createSeededRandom(441)
    for (let trial = 0; trial < 200; trial++) {
      const disc = discAt(500 + random.nextInt(4_000), 500 + random.nextInt(4_000))
      const window = subStepWindow(random.nextInt(100_000))
      const subSteps = 1 + random.nextInt(900)
      const drillTicksOf: CellDrillTicks = () => subSteps
      const whole = carveDisc(EMPTY_WORLD, params, disc, window, drillTicksOf)
      const walk = chargingByDwell(wholeTickAtOwnWeight(disc), walkStampInRows)
      const dwelt = carveDisc(EMPTY_WORLD, params, disc, window, drillTicksOf, walk)
      expect(dwelt.world).toEqual(whole.world)
      expect(dwelt.ticksUsed).toBe(whole.ticksUsed)
    }
  })

  it('cuts nothing and uses no tick where no station spent work within reach', () => {
    const disc = discAt(500, 3_500)
    const walk = chargingByDwell(() => 0, walkStampInRows)
    const carved = carveDisc(EMPTY_WORLD, params, disc, subStepWindow(40), () => 30, walk)
    expect(carved.changes).toEqual([])
    expect(carved.ticksUsed).toBe(0)
  })

  it('removes within one density unit the same over two half ticks as over one whole tick', () => {
    const random = createSeededRandom(4410)
    for (let trial = 0; trial < 2_000; trial++) {
      const weight = 1 + random.nextInt(FULL_WEIGHT)
      const sample = { sx: 0, sy: 0, weight, floor: 0 }
      const firstTick = random.nextInt(100_000)
      const drillTicks = 1 + random.nextInt(2_000)
      const removalOf = (tick: number, work: number) =>
        dwellRemovalOf(sample, { ...subStepWindow(tick), dwellAt: () => work * weight }, drillTicks)
      const halves = removalOf(firstTick, Q / 2) + removalOf(firstTick + 1, Q / 2)
      expect(Math.abs(halves - removalOf(firstTick, Q))).toBeLessThanOrEqual(1)
    }
  })

  it('answers whole density units only, from integer dwell', () => {
    const random = createSeededRandom(44100)
    for (let trial = 0; trial < 500; trial++) {
      const sample = { sx: 0, sy: 0, weight: random.nextInt(FULL_WEIGHT + 1), floor: 0 }
      const dwellAt = () => random.nextInt(800) * random.nextInt(FULL_WEIGHT + 1)
      const window = { ...subStepWindow(random.nextInt(10_000)), dwellAt }
      expect(Number.isInteger(dwellRemovalOf(sample, window, 1 + random.nextInt(800)))).toBe(true)
    }
  })

  it('charges the cells carved beside the disc the whole window, as before', () => {
    const disc = discAt(1_500)
    const beside = [{ tx: 3, ty: 280 }]
    const windows = { disc: subStepWindow(70), cells: subStepWindow(70) }
    const centreOnly: SampleDwell = (sx, sy) => Q * discWeightAt(disc, disc.radiusMm, sx, sy)
    const drillTicksOf: CellDrillTicks = () => 90
    const plain = carveDiscWithCells(EMPTY_WORLD, params, disc, beside, windows, drillTicksOf)
    const walk = chargingByDwell(centreOnly, walkStampInRows)
    const dwelt = carveDiscWithCells(EMPTY_WORLD, params, disc, beside, windows, drillTicksOf, walk)
    const samples = cellSamplesBesideDisc(beside[0], disc)
    expect(samples.length).toBeGreaterThan(0)
    for (const { sx, sy } of samples) {
      expect(densityAt(dwelt.world, sx, sy)).toBe(densityAt(plain.world, sx, sy))
    }
    expect(dwelt.cellTicksUsed).toEqual(plain.cellTicksUsed)
  })
})

describe('bare disc weight (ticket 441)', () => {
  it("gives a capsule's own weight at its centre's disc and nothing past the radius", () => {
    const disc = discAt(500)
    for (const { sx, sy, weight } of discSamplesOf(disc)) {
      expect(discWeightAt(disc, disc.radiusMm, sx, sy)).toBe(weight)
    }
    expect(discWeightAt(disc, disc.radiusMm, 20, 280_300 / 250)).toBe(0)
  })
})
