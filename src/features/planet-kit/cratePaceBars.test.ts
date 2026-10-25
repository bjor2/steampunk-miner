import { describe, expect, it } from 'vitest'
import { emptyDrillPaceTally } from '../../logging/drillPace'
import { emptyRadiusRebaselineTally } from '../../logging/radiusRebaseline'
import { cratePaceLinesOf, cratePaceProblemsOf } from './cratePaceBars'
import type { CratePaceRun } from './cratePaceRuns'

// The crates on/off replay's bars (ticket 850): judged on the seeds' medians, a crates-on miss
// counts only where crates off holds the bar; the cargo hold may trail crates off by 1 level.

/** A run that reached no core, leaving each planet with its cargo hold `levels[planet - 1]`. */
function runLeaving(worldSeed: number, levels: readonly number[]): CratePaceRun {
  return {
    worldSeed,
    drill: emptyDrillPaceTally(),
    radius: emptyRadiusRebaselineTally(),
    cargoLevels: new Map(levels.map((level, at) => [at + 1, level])),
    cratesBought: 3,
    cratesDropped: 0,
    cratesPickedUp: 0,
  }
}

describe('planet kit: the crates on/off bars (ticket 850)', () => {
  it('flags a cargo hold left more than 1 level behind crates off on the median seed', () => {
    const off = [1, 2, 3].map((seed) => runLeaving(seed, [4, 8, 12, 16, 20]))
    const on = [1, 2, 3].map((seed) => runLeaving(seed, [4, 7, 10, 16, 20]))
    expect(cratePaceProblemsOf(off, on)).toEqual([
      "crates on: planet 3 left with cargo hold level 10, more than 1 below crates off's 12",
    ])
  })

  it('leaves a time or money miss crates off shares to the bare bot’s lane', () => {
    const runs = [1, 2, 3].map((seed) => runLeaving(seed, [4, 8, 12, 16, 20]))
    expect(cratePaceProblemsOf(runs, runs)).toEqual([])
  })

  it('prints a row per planet and what the crates did on each seed', () => {
    const runs = [1, 2, 3].map((seed) => runLeaving(seed, [4, 8, 12, 16, 20]))
    const lines = cratePaceLinesOf(runs, runs)
    expect(lines).toHaveLength(1 + 5 + 3)
    expect(lines[1]).toBe('| 1 | never | never | - | - | - | 4 | 4 |')
    expect(lines[6]).toBe('seed 1 crates on: 3 bought, 0 dropped, 0 picked up')
  })
})
