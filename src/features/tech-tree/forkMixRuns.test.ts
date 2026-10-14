import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TICKS_PER_SECOND } from '../../constants/physics'
import type { Scenario } from '../../systems/scenario'
import { forcedForkStartOf, forkHandsOf } from './forkHand'
import { forkSeedRunOf, laneItemIdsOf, laneSeedRunOf, registeredForkBranches } from './forkMixRuns'
import { FORK_FIXTURE_SLICE } from './treeFixtureSlice'
import { researchedMarkOf } from './systems/itemMarks'
import { PLAYER, sessionOnPlanet, withFixtureTree } from './treeTestSession'
import type { ForkBranchNode } from './systems/techTree'

const SCENARIO = JSON.parse(
  readFileSync(new URL('../../../scenarios/bot-slice.scenario.json', import.meta.url), 'utf8'),
) as Scenario
const SEED = 83921
/** Long enough for the bot's first dives on planet 1, nowhere near its core. */
const SHORT_RUN_TICKS = 6 * 60 * TICKS_PER_SECOND

function branchOf(lane: string, branch: string): ForkBranchNode {
  const found = registeredForkBranches().find(
    (fork) => fork.lane === lane && fork.branch === branch,
  )
  if (found === undefined) throw new Error(`no ${lane} branch ${branch}`)
  return found
}

function drillGearBranch(branch: string): ForkBranchNode {
  return branchOf('drill-gear', branch)
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

// The Aetheric pace re-run's start (ticket 266) on the registered lane: the whole lane forced, the
// hours-long pins are `aethericPace.lane.test.ts`.
describe('tech tree: a run forced onto a whole lane', () => {
  it("owns the lane's capabilities earliest first, the fork's other branch left out", () => {
    expect(laneItemIdsOf(branchOf('aetheric', 'phase'))).toEqual([
      'power.resonance_whistle',
      'power.phase_lantern',
      'power.chronometric_governor',
      'power.aether_condenser',
    ])
  })

  it('bolts the earliest items into the slots open at the start, one item a slot', () => {
    const hands = forkHandsOf(laneItemIdsOf(branchOf('aetheric', 'arc')))
    expect(hands).toEqual([
      { itemId: 'power.resonance_whistle', slot: 'powerup.1' },
      { itemId: 'power.arc_coil', slot: 'powerup.2' },
    ])
  })

  it('starts with the lane owned and the two slotted, the branch active', () => {
    const session = sessionOnPlanet(1)
    const owned = laneItemIdsOf(branchOf('aetheric', 'arc'))
    const start = forcedForkStartOf({ lane: 'aetheric', branch: 'arc' }, forkHandsOf(owned), owned)
    start.forEach((intent) => session.submit(intent))
    const { loadout } = session.state().players[PLAYER].vehicle
    expect([...loadout.owned].sort()).toEqual([...owned].sort())
    expect([loadout.slots['powerup.1'], loadout.slots['powerup.2']]).toEqual([
      'power.resonance_whistle',
      'power.arc_coil',
    ])
    expect(researchedMarkOf(session.state(), PLAYER, 'power.arc_coil')).toBeGreaterThan(0)
  })

  it('plays the bot on the forced lane and keeps its pace from the start', () => {
    const run = laneSeedRunOf(SCENARIO, branchOf('aetheric', 'phase'), SEED, SHORT_RUN_TICKS)
    expect(run).toMatchObject({ lane: 'aetheric', branch: 'phase', worldSeed: SEED })
    expect(run.lanePace).toEqual({ firstCoreTicks: null, sliceTicks: null, planetTicks: null })
  })
})
