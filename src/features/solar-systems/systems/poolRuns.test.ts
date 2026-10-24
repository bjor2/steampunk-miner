import { describe, expect, it } from 'vitest'
import type { OreMix, OreMixEntry } from '../../planet-mix'
import { paintedRunsOf, splitRunsOf, type PaintedRun } from './poolRuns'

// The runs a generated pool is cut from (ticket 777): the mix's families per rarity lead, split
// heaviest-per-kind first until the planet holds its target.

function entry(family: string, lead: number, weightBp: number, signature = false): OreMixEntry {
  return { typeId: `${family}_t1`, family, tier: 1 + lead, lead, weightBp, signature }
}

const MIX: OreMix = {
  planetIndex: 6,
  themeId: 'foothold.heavy',
  accent: null,
  isBandThreeSwapped: false,
  bands: [
    [entry('crystal', 0, 9750), entry('metal', 1, 250)],
    [entry('metal', 0, 9858), entry('crystal', 1, 142)],
    [entry('crystal', 0, 9772), entry('metal', 1, 155), entry('fossil', 3, 17)],
    [entry('metal', 0, 9400), entry('relic', 1, 300, true), entry('fossil', 2, 0)],
    [entry('crystal', 0, 9166), entry('fossil', 3, 70)],
  ],
}

function run(family: string, lead: number, weightBp: number): PaintedRun {
  return { family, lead, window: [1, 1], weightBp }
}

describe('pool runs', () => {
  it('folds each family and lead the mix paints into one run over its first and last band', () => {
    expect(paintedRunsOf(MIX)).toEqual([
      { family: 'crystal', lead: 0, window: [1, 5], weightBp: 9750 + 9772 + 9166 },
      { family: 'metal', lead: 0, window: [2, 4], weightBp: 9858 + 9400 },
      { family: 'metal', lead: 1, window: [1, 3], weightBp: 250 + 155 },
      { family: 'crystal', lead: 1, window: [2, 2], weightBp: 142 },
      { family: 'fossil', lead: 3, window: [3, 5], weightBp: 17 + 70 },
    ])
  })

  it('leaves the signature and every weightless entry kindless', () => {
    const families = paintedRunsOf(MIX).map((painted) => `${painted.family}+${painted.lead}`)
    expect(families).not.toContain('relic+1')
    expect(families).not.toContain('fossil+2')
  })

  it('splits the run whose kinds carry the most weight each until the target, one kind a run below it', () => {
    const runs = [run('crystal', 0, 30000), run('metal', 0, 20000), run('fossil', 3, 90)]
    expect(splitRunsOf(runs, 2).map((split) => split.kinds)).toEqual([1, 1, 1])
    expect(splitRunsOf(runs, 4).map((split) => split.kinds)).toEqual([2, 1, 1])
    expect(splitRunsOf(runs, 6).map((split) => split.kinds)).toEqual([3, 2, 1])
  })

  it('splits the earlier run first between two equally heavy ones', () => {
    const runs = [run('crystal', 0, 20000), run('metal', 0, 20000)]
    expect(splitRunsOf(runs, 3).map((split) => split.kinds)).toEqual([2, 1])
  })
})
