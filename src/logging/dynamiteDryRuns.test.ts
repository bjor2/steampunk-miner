import { describe, expect, it } from 'vitest'
import {
  dryRunTableOf,
  dryRunWarnings,
  dynamiteScopeTableOf,
  longestDryRunsOf,
  type DynamiteScopePlanet,
} from './dynamiteDryRuns'

// Where the dynamite acts run dry (ticket 296, the GD ruling on #237 and its amendments): only
// planets of a dynamite act count, consecutive among themselves, the rest read n/a; a seed's run
// longer than 2 is data for Systems and a planet dry on every seed a content finding.

const SEEDS = [83921, 31415, 27182]

function planet(index: number, tilesBySeed: number[] | null): DynamiteScopePlanet {
  return { planet: index, tilesBySeed }
}

/** Fire's last planets, a rig-gated stretch, then the endless Fire and Foothold repeats. */
const CENSUS = [
  planet(15, [4, 0, 3]),
  planet(16, [5, 0, 0]),
  planet(17, null),
  planet(40, null),
  planet(41, [2, 0, 0]),
  planet(42, null),
  planet(45, [1, 6, 0]),
]

describe('dynamite dry runs', () => {
  it('counts consecutive in-scope planets per seed, skipping the planets of rig-gated acts', () => {
    expect(longestDryRunsOf(CENSUS, SEEDS)).toEqual([
      { seed: 83921, planets: [] },
      { seed: 31415, planets: [15, 16, 41] },
      { seed: 27182, planets: [16, 41, 45] },
    ])
  })

  it('prints n/a for every planet outside the dynamite acts, never 0', () => {
    const table = dynamiteScopeTableOf(CENSUS, SEEDS)
    expect(table).toContain('| 17 | no | n/a | n/a | n/a |')
    expect(table).toContain('| 41 | yes | 2 | 0 | 0 |')
  })

  it('flags a dry run longer than 2 as data for Systems', () => {
    const runs = longestDryRunsOf(CENSUS, SEEDS)
    expect(dryRunTableOf(runs)).toContain('| 31415 | 3 | 15, 16, 41 | no |')
    expect(dryRunWarnings(CENSUS, runs)).toEqual([
      'seed 31415: 3 dynamite-act planets in a row with no dynamite cells (15, 16, 41), data for Systems',
      'seed 27182: 3 dynamite-act planets in a row with no dynamite cells (16, 41, 45), data for Systems',
    ])
  })

  it('flags an in-scope planet dry on every seed as a content finding, and no rig-gated one', () => {
    const census = [planet(7, [3, 2, 1]), planet(8, [0, 0, 0]), planet(22, null)]
    expect(dryRunWarnings(census, longestDryRunsOf(census, SEEDS))).toEqual([
      'planet 8: a dynamite act with no dynamite cells on any seed (a content finding for Content and Planet)',
    ])
  })
})
