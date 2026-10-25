import { describe, expect, it } from 'vitest'
import type { OreMix, OreMixEntry } from '../../planet-mix'
import { paintedRunsOf, splitRunsOf, type PaintedRun } from './poolRuns'

// The runs a generated pool is cut from (ticket 777): the mix's families per rarity lead, split
// heaviest-per-kind first until the planet holds its target, each run first given the least kinds
// the VS's band-trip bounds ask for (ticket 888).

/** No bound: every run's least kinds is one. */
const UNBOUNDED = { commonBp: 10000, otherBp: 10000 }
/** The VS's bounds of ticket 446: a common kind 5000 bp of a band trip, any other kind 1500. */
const VS_CAPS = { commonBp: 5000, otherBp: 1500 }

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
  return { family, lead, window: [1, 1], weightBp, leastKinds: 1 }
}

describe('pool runs', () => {
  it('folds each family and lead the mix paints into one run over its first and last band', () => {
    expect(paintedRunsOf(MIX, UNBOUNDED)).toEqual([
      { family: 'crystal', lead: 0, window: [1, 5], weightBp: 9750 + 9772 + 9166, leastKinds: 1 },
      { family: 'metal', lead: 0, window: [2, 4], weightBp: 9858 + 9400, leastKinds: 1 },
      { family: 'metal', lead: 1, window: [1, 3], weightBp: 250 + 155, leastKinds: 1 },
      { family: 'crystal', lead: 1, window: [2, 2], weightBp: 142, leastKinds: 1 },
      { family: 'fossil', lead: 3, window: [3, 5], weightBp: 17 + 70, leastKinds: 1 },
    ])
  })

  it('leaves the signature and every weightless entry kindless', () => {
    const families = paintedRunsOf(MIX, UNBOUNDED).map(
      (painted) => `${painted.family}+${painted.lead}`,
    )
    expect(families).not.toContain('relic+1')
    expect(families).not.toContain('fossil+2')
  })

  it('splits the run whose kinds carry the most weight each until the target, one kind a run below it', () => {
    const runs = [run('crystal', 0, 30000), run('metal', 0, 20000), run('fossil', 3, 90)]
    expect(splitRunsOf(runs, 2).map((split) => split.kinds)).toEqual([1, 1, 1])
    expect(splitRunsOf(runs, 4).map((split) => split.kinds)).toEqual([2, 1, 1])
    expect(splitRunsOf(runs, 6).map((split) => split.kinds)).toEqual([3, 2, 1])
  })

  it("gives each run the least kinds its band cells' weight and value shares ask for", () => {
    // Band 1: crystal common 9750 bp of the patches, so two kinds of 4875; metal +1 is 250 bp of
    // the patches but 375 of 9750 + 375 value units, 370 bp of the trip: one kind. Band 5: fossil
    // +3 is 70 bp at 27/8 the value of 9166 crystal commons, 254 bp of the trip: one kind.
    const least = paintedRunsOf(MIX, VS_CAPS).map((painted) => painted.leastKinds)
    expect(least).toEqual([2, 2, 1, 1, 1])
  })

  it('lets the least kinds pass the target, and splits only past them', () => {
    const runs = [{ ...run('crystal', 0, 30000), leastKinds: 3 }, run('metal', 0, 20000)]
    expect(splitRunsOf(runs, 2).map((split) => split.kinds)).toEqual([3, 1])
    expect(splitRunsOf(runs, 6).map((split) => split.kinds)).toEqual([4, 2])
  })

  it('splits the earlier run first between two equally heavy ones', () => {
    const runs = [run('crystal', 0, 20000), run('metal', 0, 20000)]
    expect(splitRunsOf(runs, 3).map((split) => split.kinds)).toEqual([2, 1])
  })
})
