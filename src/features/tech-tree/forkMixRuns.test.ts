import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TICKS_PER_SECOND } from '../../constants/physics'
import type { Scenario } from '../../systems/scenario'
import { forkSeedRunOf, registeredForkBranches } from './forkMixRuns'
import { FORK_FIXTURE_SLICE } from './treeFixtureSlice'
import { withFixtureTree } from './treeTestSession'
import type { ForkBranchNode } from './systems/techTree'

const SCENARIO = JSON.parse(
  readFileSync(new URL('../../../scenarios/bot-slice.scenario.json', import.meta.url), 'utf8'),
) as Scenario
const SEED = 83921
/** Long enough for the bot's first dives on planet 1, nowhere near its core. */
const SHORT_RUN_TICKS = 6 * 60 * TICKS_PER_SECOND

function drillGearBranch(branch: string): ForkBranchNode {
  const found = registeredForkBranches().find(
    (fork) => fork.lane === 'drill-gear' && fork.branch === branch,
  )
  if (found === undefined) throw new Error(`no drill-gear branch ${branch}`)
  return found
}

// The plumbing of `balance:forks` (ticket 267) on a short run: the forced start, the bot playing
// on through it, and the tallies kept in place of the run. The hours-long gate is the lane.
describe('tech tree: a forced fork run', () => {
  it('plays the bot on the forced branch and keeps its pace and action mix', () => {
    withFixtureTree(() => {
      const run = forkSeedRunOf(SCENARIO, drillGearBranch('wide'), SEED, SHORT_RUN_TICKS)
      expect(run).toMatchObject({ lane: 'drill-gear', branch: 'wide', worldSeed: SEED })
      expect(run.pace).toEqual({ sliceTicks: null, planetTicks: null })
      expect(run.planetTicks.every((ticks) => ticks === null)).toBe(true)
      expect(run.mixValues).toHaveLength(1)
      expect(run.mixValues[0]).toBeGreaterThan(0)
    }, [FORK_FIXTURE_SLICE])
  })

  it('reads the same numbers from a second run on the same branch and seed', () => {
    withFixtureTree(() => {
      const runOf = () => forkSeedRunOf(SCENARIO, drillGearBranch('deep'), SEED, SHORT_RUN_TICKS)
      expect(runOf()).toEqual(runOf())
    }, [FORK_FIXTURE_SLICE])
  })
})
