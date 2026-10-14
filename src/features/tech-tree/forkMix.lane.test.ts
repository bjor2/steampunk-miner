import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { PACING_WORLD_SEEDS } from '../../constants/pacingSeeds'
import type { Scenario } from '../../systems/scenario'
import { forkSeedRunOf, registeredForkBranches } from './forkMixRuns'
import {
  forkPairVerdictsOf,
  formatForkReport,
  planetFloorMissesOf,
  sameMixPairsOf,
  sliceBandMissesOf,
  sliceSpreadMissesOf,
  type ForkPairVerdict,
  type ForkSeedRun,
} from './systems/forkMixReport'
import { TECH_LANES } from './systems/techNode'
import type { ForkBranchNode } from './systems/techTree'

// `balance:forks` (GD lock on #255, build 2; ticket 267): the pacing bot plays the bot scenario to
// planet 10's core on each pacing seed (83921, 31415, 27182), forced onto each registered fork
// branch from the start (`forkHand.ts`: the branch granted, its item slotted and pressed at every
// chance). Per branch, on the median of the seeds: P8 at 45 minutes or more and the slice at
// 100-110; a pair's two slice medians within 10%; and the lane's action-mix metric
// (`forkMixMetrics.ts`) apart between the branches: a pair that differs only in stats fails. It
// runs inside the combined re-baseline once the forks register; a miss is a balance finding for
// the lane's branch build, never a reason to retune the bot or a pin. Six pairs, two branches,
// three seeds: 36 runs of hours each, so this is a lane (vite.config.ts leaves it out unless it is
// named):
//   npx vitest run src/features/tech-tree/forkMix.lane.test.ts   (or npm run balance:forks)
const RUN_TIMEOUT_MS = 24 * 60 * 60 * 1000
const SCENARIO_FILE = new URL('../../../scenarios/bot-slice.scenario.json', import.meta.url)
const SEEDS = PACING_WORLD_SEEDS['bot-slice']

describe('tech tree: balance:forks, the pacing bot forced onto each fork branch', () => {
  let verdicts: ForkPairVerdict[] = []

  beforeAll(() => {
    const branches = branchesToPlay()
    const scenario = JSON.parse(readFileSync(SCENARIO_FILE, 'utf8')) as Scenario
    const runs = branches.flatMap((branch) =>
      SEEDS.map((seed) => forkSeedRunOf(scenario, branch, seed)),
    )
    verdicts = forkPairVerdictsOf(runs)
    console.log(reportOf(runs, verdicts, branches))
  }, RUN_TIMEOUT_MS)

  it('holds planet 8 of every branch to 45 minutes or more on the median seed', () => {
    expect(planetFloorMissesOf(verdicts)).toEqual([])
  })

  it('holds the slice of every branch to 100-110 minutes on the median seed', () => {
    expect(sliceBandMissesOf(verdicts)).toEqual([])
  })

  it("keeps each pair's two slice medians within 10% of each other", () => {
    expect(sliceSpreadMissesOf(verdicts)).toEqual([])
  })

  // Ticket 391: the aetheric pair is pinned, so a lane run that left it out fails rather than passes.
  it('plays the aetheric pair, the bot forced onto the phase branch and the arc branch', () => {
    const aetheric = verdicts.find((pair) => pair.lane === 'aetheric')
    expect(aetheric?.branches.map((branch) => branch.branch)).toEqual(['phase', 'arc'])
  })

  it("moves each pair's action-mix metric between its branches on the median seed", () => {
    expect(sameMixPairsOf(verdicts)).toEqual([])
  })
})

/** Refused with no pair registered: a lane that judged nothing would pass. */
function branchesToPlay(): readonly ForkBranchNode[] {
  const branches = registeredForkBranches()
  if (branches.length > 0) return branches
  throw new Error('balance:forks refused: no lane registers a fork pair, so no branch to force')
}

function reportOf(
  runs: readonly ForkSeedRun[],
  verdicts: readonly ForkPairVerdict[],
  branches: readonly ForkBranchNode[],
): string {
  const forked = new Set(branches.map((branch) => branch.lane))
  const unforked = TECH_LANES.filter((lane) => !forked.has(lane))
  const unforkedLine = `lanes with no fork pair registered: ${unforked.join(', ') || 'none'}`
  return `${formatForkReport(runs, verdicts)}\n\n${unforkedLine}`
}
