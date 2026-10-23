import { describe, expect, it } from 'vitest'
import type { BandDig, PlanetLevels } from './bandDigReport'
import { deriveSummary, type RunSummary } from './runSummary'
import {
  formatSawtoothSeedTable,
  medianSawtoothScores,
  sawtoothMisses,
  sawtoothMissesOn,
} from './sawtoothMedian'

/**
 * A seed's summary that reached `reached` planets and dug band 5 down as given; sideways as given,
 * else at the same times as down (the drill binds both legs).
 */
function seedRun(
  worldSeed: number,
  digs: Record<string, BandDig>,
  reached: number,
  planetLevels: PlanetLevels = { arrival: {}, departure: {} },
  sidewaysDigs: Record<string, BandDig> = digs,
) {
  const planetReached = Object.fromEntries(
    Array.from({ length: reached }, (_, index) => [String(index + 1), index * 1000]),
  )
  const empty = deriveSummary([])
  const summary: RunSummary = {
    ...empty,
    sawtoothBandDigTicks: digs,
    sawtoothSidewaysDigTicks: sidewaysDigs,
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
    expect(medianSawtoothScores(runs, 'down')).toEqual({ '2': 0.65 })
    expect(sawtoothMisses(runs)).toEqual([])
  })

  it('reports a planet whose median band 5 dig got less than 30% faster', () => {
    const runs = [
      seedRun(1, { '4': { arrival: 30, departure: 24 } }, 5),
      seedRun(2, { '4': { arrival: 32, departure: 24 } }, 5),
      seedRun(3, { '4': { arrival: 45, departure: 24 } }, 5),
    ]
    expect(sawtoothMisses(runs)).toEqual([
      'planet 4 band 5 down median 0.75x, target at most 0.7x',
      'planet 4 band 5 sideways median 0.75x, target at most 0.7x',
    ])
  })

  // #723's drive-bound law (Game Director on #762): each leg reads the upgrade that binds it.
  it('judges the sideways leg on its own, so a drive that held the cut misses where the drill met the bar', () => {
    const down = { '3': { arrival: 20, departure: 10 } }
    const sideways = { '3': { arrival: 20, departure: 16 } }
    const runs = [seedRun(1, down, 4, undefined, sideways)]
    expect(sawtoothMissesOn(runs, 3, 'down')).toEqual([])
    expect(sawtoothMissesOn(runs, 3, 'sideways')).toEqual([
      'planet 3 band 5 sideways median 0.80x, target at most 0.7x',
    ])
  })

  it('misses nothing on a planet no seed left', () => {
    const runs = [seedRun(1, { '3': { arrival: 20, departure: 20 } }, 3)]
    expect(sawtoothMissesOn(runs, 3, 'down')).toEqual([])
  })

  it('leaves out the planet a run stopped on, which has no departure yet', () => {
    const runs = [
      seedRun(1, { '1': { arrival: 45, departure: 24 }, '2': { arrival: 45, departure: 45 } }, 2),
    ]
    expect(medianSawtoothScores(runs, 'down')).toEqual({ '1': 24 / 45 })
  })

  it('takes the slower of the two middle ratios when only two seeds left a planet', () => {
    const runs = [
      seedRun(1, { '7': { arrival: 40, departure: 24 } }, 8),
      seedRun(2, { '7': { arrival: 30, departure: 24 } }, 8),
      seedRun(3, { '7': { arrival: 40, departure: 40 } }, 7),
    ]
    expect(medianSawtoothScores(runs, 'sideways')).toEqual({ '7': 0.8 })
  })

  it('counts a departure that still skids as a miss', () => {
    const runs = [seedRun(1, { '3': { arrival: null, departure: null } }, 4)]
    expect(sawtoothMissesOn(runs, 3, 'down')).toEqual([
      'planet 3 band 5 down median no dig, target at most 0.7x',
    ])
  })

  it('prints each seed ratio per leg beside the median, with a dash where a seed never left', () => {
    const sideways = { '1': { arrival: 40, departure: 36 }, '2': { arrival: 40, departure: 30 } }
    const runs = [
      seedRun(
        11,
        { '1': { arrival: 40, departure: 24 }, '2': { arrival: 40, departure: 20 } },
        3,
        undefined,
        sideways,
      ),
      seedRun(22, { '1': { arrival: 40, departure: 32 } }, 2),
    ]
    expect(formatSawtoothSeedTable(runs)).toBe(
      [
        '| planet | leg | seed 11 | seed 22 | median |',
        '| --- | --- | --- | --- | --- |',
        '| 1 | down | 0.60x | 0.80x | 0.80x |',
        '| 1 | sideways | 0.90x | 0.80x | 0.90x |',
        '| 2 | down | 0.50x (drill -12/-15, tip -7/-10) | - | 0.50x |',
        '| 2 | sideways | 0.75x (drill -12/-15, tip -7/-10) | - | 0.75x |',
      ].join('\n'),
    )
  })

  it('prints the drill and tip leads on arrival and at departure beside a seed ratio', () => {
    // On curve, planet 3 is left with drill_power 18 and drill_tip 13; planet 4 with 21 and 16.
    // The logged levels are steps (#180): drill power counts purchases (#552), the tip majors, so
    // a pip short of tip major 13 is 129.
    const planetLevels = {
      arrival: { '4': { drill_power: 19, drill_tip: 129 } },
      departure: { '4': { drill_power: 22, drill_tip: 180 } },
    }
    const runs = [seedRun(5, { '4': { arrival: 41, departure: 24 } }, 5, planetLevels)]
    expect(formatSawtoothSeedTable(runs).split('\n')[2]).toBe(
      '| 4 | down | 0.59x (drill +1/+1, tip -1/+2) | 0.59x |',
    )
  })
})
