import { describe, expect, it } from 'vitest'
import type { BandDig, PlanetLevels } from './bandDigReport'
import { deriveSummary, type RunSummary } from './runSummary'
import { formatSawtoothSeedTable, medianSawtoothScores, sawtoothMisses } from './sawtoothMedian'

/** A seed's summary that reached `reached` planets and dug band 5 as given. */
function seedRun(
  worldSeed: number,
  digs: Record<string, BandDig>,
  reached: number,
  planetLevels: PlanetLevels = { arrival: {}, departure: {} },
) {
  const planetReached = Object.fromEntries(
    Array.from({ length: reached }, (_, index) => [String(index + 1), index * 1000]),
  )
  const empty = deriveSummary([])
  const summary: RunSummary = {
    ...empty,
    sawtoothBandDigTicks: digs,
    planetLevels,
    milestones: { ...empty.milestones, planetReached },
  }
  return { worldSeed, summary }
}

describe('sawtooth on the median of the pacing seeds (#86)', () => {
  it('judges each planet on the middle ratio of the seeds', () => {
    const runs = [
      seedRun(1, { '2': { arrival: 40, departure: 36 } }, 3),
      seedRun(2, { '2': { arrival: 40, departure: 24 } }, 3),
      seedRun(3, { '2': { arrival: 40, departure: 26 } }, 3),
    ]
    expect(medianSawtoothScores(runs)).toEqual({ '2': 0.65 })
    expect(sawtoothMisses(runs)).toEqual([])
  })

  it('reports a planet whose median band 5 dig got less than 30% faster', () => {
    const runs = [
      seedRun(1, { '4': { arrival: 30, departure: 24 } }, 5),
      seedRun(2, { '4': { arrival: 32, departure: 24 } }, 5),
      seedRun(3, { '4': { arrival: 45, departure: 24 } }, 5),
    ]
    expect(sawtoothMisses(runs)).toEqual(['planet 4 band 5 median 0.75x, target at most 0.7x'])
  })

  it('leaves out the planet a run stopped on, which has no departure yet', () => {
    const runs = [
      seedRun(1, { '1': { arrival: 45, departure: 24 }, '2': { arrival: 45, departure: 45 } }, 2),
    ]
    expect(medianSawtoothScores(runs)).toEqual({ '1': 24 / 45 })
  })

  it('takes the slower of the two middle ratios when only two seeds left a planet', () => {
    const runs = [
      seedRun(1, { '7': { arrival: 40, departure: 24 } }, 8),
      seedRun(2, { '7': { arrival: 30, departure: 24 } }, 8),
      seedRun(3, { '7': { arrival: 40, departure: 40 } }, 7),
    ]
    expect(medianSawtoothScores(runs)).toEqual({ '7': 0.8 })
  })

  it('counts a departure that still skids as a miss', () => {
    const runs = [seedRun(1, { '3': { arrival: null, departure: null } }, 4)]
    expect(sawtoothMisses(runs)).toEqual(['planet 3 band 5 median no dig, target at most 0.7x'])
  })

  it('prints each seed ratio beside the median, with a dash where a seed never left', () => {
    const runs = [
      seedRun(11, { '1': { arrival: 40, departure: 24 }, '2': { arrival: 40, departure: 20 } }, 3),
      seedRun(22, { '1': { arrival: 40, departure: 32 } }, 2),
    ]
    expect(formatSawtoothSeedTable(runs)).toBe(
      [
        '| planet | seed 11 | seed 22 | median |',
        '| --- | --- | --- | --- |',
        '| 1 | 0.60x | 0.80x | 0.80x |',
        '| 2 | 0.50x (drill -13/-19, tip -7/-10) | - | 0.50x |',
      ].join('\n'),
    )
  })

  it('prints the drill and tip leads on arrival and at departure beside a seed ratio', () => {
    // On curve, planet 3 is left with drill_power 25 and drill_tip 13; planet 4 with 31 and 16.
    // The logged levels are steps (#180): major 26 is step 260, and a pip short of 13 is 129.
    const planetLevels = {
      arrival: { '4': { drill_power: 260, drill_tip: 129 } },
      departure: { '4': { drill_power: 325, drill_tip: 180 } },
    }
    const runs = [seedRun(5, { '4': { arrival: 41, departure: 24 } }, 5, planetLevels)]
    expect(formatSawtoothSeedTable(runs).split('\n')[2]).toBe(
      '| 4 | 0.59x (drill +1/+1, tip -1/+2) | 0.59x |',
    )
  })
})
