import { describe, expect, it } from 'vitest'
import { formatSeedPacingTable, medianPacingReport } from './pacingMedian'
import { pacingProblems, type PacingReport } from './pacingReport'

const MINUTE = 60 * 60

function reportOf(changes: Partial<PacingReport>): PacingReport {
  return {
    firstSaleTick: 60 * 60,
    firstUpgradeTick: 90 * 60,
    upgradesByEarlyCheck: 4,
    tracksByEarlyCheck: 3,
    deepestBandByEarlyCheck: 2,
    coreCompletedTick: { '1': 50 * MINUTE, '2': 100 * MINUTE },
    coreTicksOnPlanet: { '1': 50 * MINUTE, '2': 48 * MINUTE },
    sliceEndTick: 100 * MINUTE,
    tripsByPlanet: { '1': 6, '2': 5 },
    finalLevels: { drill_power: 190, drill_tip: 104 },
    rescuesByCause: {},
    ...changes,
  }
}

describe('pacing median over seeded runs', () => {
  it('takes the middle value of each metric on its own', () => {
    const median = medianPacingReport([
      reportOf({ sliceEndTick: 94 * MINUTE, firstSaleTick: 30 * 60 }),
      reportOf({ sliceEndTick: 134 * MINUTE, firstSaleTick: 50 * 60 }),
      reportOf({ sliceEndTick: 100 * MINUTE, firstSaleTick: 70 * 60 }),
    ])
    expect(median.sliceEndTick).toBe(100 * MINUTE)
    expect(median.firstSaleTick).toBe(50 * 60)
  })

  it('passes the slice gate when one seed of three misses it', () => {
    const median = medianPacingReport([
      reportOf({ sliceEndTick: 89 * MINUTE }),
      reportOf({ sliceEndTick: 96 * MINUTE }),
      reportOf({ sliceEndTick: 114 * MINUTE }),
    ])
    expect(pacingProblems(median)).toEqual([])
  })

  it('fails the slice gate when two seeds of three miss it', () => {
    const median = medianPacingReport([
      reportOf({ sliceEndTick: 88 * MINUTE }),
      reportOf({ sliceEndTick: 89 * MINUTE }),
      reportOf({ sliceEndTick: 114 * MINUTE }),
    ])
    expect(pacingProblems(median)).toEqual(['slice at 89.0 min, target 90 to 130 min'])
  })

  it('counts a first sale that never happened as later than any tick', () => {
    const median = medianPacingReport([
      reportOf({ firstSaleTick: null }),
      reportOf({ firstSaleTick: null }),
      reportOf({ firstSaleTick: 30 * 60 }),
    ])
    expect(median.firstSaleTick).toBeNull()
  })

  it('leaves out a core that most seeds never completed', () => {
    const planet1Only = { coreCompletedTick: { '1': 50 * MINUTE } }
    const median = medianPacingReport([
      reportOf(planet1Only),
      reportOf(planet1Only),
      reportOf({ coreCompletedTick: { '1': 40 * MINUTE, '2': 99 * MINUTE } }),
    ])
    expect(median.coreCompletedTick).toEqual({ '1': 50 * MINUTE })
  })

  it('counts a rescue cause missing from a seed as none there', () => {
    const median = medianPacingReport([
      reportOf({ rescuesByCause: { destroyed: 3 } }),
      reportOf({ rescuesByCause: {} }),
      reportOf({ rescuesByCause: { destroyed: 2 } }),
    ])
    expect(median.rescuesByCause).toEqual({ destroyed: 2 })
  })

  it('prints one row per seed and the median', () => {
    const table = formatSeedPacingTable([
      { worldSeed: 83921, report: reportOf({ sliceEndTick: 94 * MINUTE }) },
      { worldSeed: 31415, report: reportOf({ sliceEndTick: 100 * MINUTE }) },
      { worldSeed: 27182, report: reportOf({ sliceEndTick: 134 * MINUTE }) },
    ])
    expect(table).toContain('| 83921 | 50.0 min | 48.0 min | 94.0 min | 0 | 19 / 10 · 4/9 |')
    expect(table).toContain('| median | 50.0 min | 48.0 min | 100.0 min | 0 | 19 / 10 · 4/9 |')
  })
})
