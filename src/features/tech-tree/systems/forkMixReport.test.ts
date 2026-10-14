import { describe, expect, it } from 'vitest'
import { TICKS_PER_SECOND } from '../../../constants/physics'
import {
  FORK_REPORT_PLANETS,
  forkPairVerdictsOf,
  formatForkReport,
  planetFloorMissesOf,
  sameMixPairsOf,
  sliceBandMissesOf,
  sliceSpreadMissesOf,
  type ForkSeedRun,
} from './forkMixReport'
import type { TechLane } from './techNode'

const MINUTE = 60 * TICKS_PER_SECOND
const SEEDS = [83921, 31415, 27182]

/** Three seeds of one branch: the slice and P8 minutes per seed, the same mix on each. */
function branchRuns(
  lane: TechLane,
  branch: string,
  slices: readonly (number | null)[],
  planet8: readonly (number | null)[],
  mixValues: readonly number[],
): ForkSeedRun[] {
  return SEEDS.map((worldSeed, at) => ({
    lane,
    branch,
    worldSeed,
    pace: { sliceTicks: ticksOf(slices[at]), planetTicks: ticksOf(planet8[at]) },
    planetTicks: FORK_REPORT_PLANETS.map((planet) => (planet === 8 ? ticksOf(planet8[at]) : null)),
    mixValues,
  }))
}

function ticksOf(minutes: number | null): number | null {
  return minutes === null ? null : minutes * MINUTE
}

const WIDE = branchRuns('drill-gear', 'wide', [101, 104, 112], [44, 48, 50], [4200])
const DEEP = branchRuns('drill-gear', 'deep', [99, 106, 107], [46, 47, 60], [900])

// `balance:forks` (GD lock on #255, ticket 267): per branch P8 at 45 or more and the slice at
// 100-110, a pair's slice medians within 10%, and its action mix apart, on the median seed.
describe('tech tree: balance:forks verdicts', () => {
  it('finds no miss for a pair inside every pin whose action mix differs', () => {
    const verdicts = forkPairVerdictsOf([...WIDE, ...DEEP])
    expect(planetFloorMissesOf(verdicts)).toEqual([])
    expect(sliceBandMissesOf(verdicts)).toEqual([])
    expect(sliceSpreadMissesOf(verdicts)).toEqual([])
    expect(sameMixPairsOf(verdicts)).toEqual([])
  })

  it('names the branch and its median minutes for each pace pin it misses', () => {
    const agile = branchRuns('mobility', 'agile', [88, 90, null], [40, 41, null], [3000])
    const armoured = branchRuns('mobility', 'armoured', [104, 105, 106], [50, 50, 50], [100])
    const verdicts = forkPairVerdictsOf([...agile, ...armoured])
    expect(planetFloorMissesOf(verdicts)).toEqual(['agile P8 41.0'])
    expect(sliceBandMissesOf(verdicts)).toEqual(['agile slice 90.0'])
    expect(sliceSpreadMissesOf(verdicts)).toEqual(['mobility: slice agile 90.0 vs armoured 105.0'])
  })

  it('fails a pair whose two branches read the same action mix on the median seed', () => {
    const bracer = branchRuns('terrain', 'bracer', [104, 104, 104], [50, 50, 50], [1200])
    const breaker = branchRuns('terrain', 'breaker', [104, 104, 104], [50, 50, 50], [1200])
    const verdicts = forkPairVerdictsOf([...bracer, ...breaker])
    expect(sameMixPairsOf(verdicts)).toEqual([
      'terrain: bracer blast cells of opened cells 12.00% vs breaker blast cells of opened cells 12.00%',
    ])
  })

  it('judges the lanes in lane order, whatever order they were played in', () => {
    const scout = branchRuns('sensing', 'scout', [104, 104, 104], [50, 50, 50], [2000, 0])
    const verdicts = forkPairVerdictsOf([...WIDE, ...scout])
    expect(verdicts.map((pair) => pair.lane)).toEqual(['sensing', 'drill-gear'])
  })

  it('prints a row for every run and a median row for every branch', () => {
    const runs = [...WIDE, ...DEEP]
    const lines = formatForkReport(runs, forkPairVerdictsOf(runs)).split('\n')
    expect(lines.filter((line) => line.startsWith('| drill-gear |'))).toHaveLength(6)
    expect(lines.filter((line) => line.includes('| median |'))).toEqual([
      '| **drill-gear** | **wide** | median | 104.0 |  |  |  |  |  | 48.0 |  |  | flank cells of cut cells 42.00% |',
      '| **drill-gear** | **deep** | median | 106.0 |  |  |  |  |  | 47.0 |  |  | flank cells of cut cells 9.00% |',
    ])
  })
})
