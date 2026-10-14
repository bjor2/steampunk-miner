import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { PACING_WORLD_SEEDS } from '../../constants/pacingSeeds'
import type { Scenario } from '../../systems/scenario'
import { laneSeedRunOf, registeredForkBranches, type LaneSeedRun } from './forkMixRuns'
import { minutesOfTicks } from './systems/forkPace'
import {
  lanePaceMissesOf,
  lanePaceTableOf,
  lanePaceVerdictOf,
  type LanePaceVerdict,
} from './systems/lanePace'
import type { ForkBranchNode } from './systems/techTree'

// The Aetheric lane's three-seed pace re-run (ticket 266; Systems on #245, inside the combined
// re-baseline): the pacing bot plays the bot scenario to planet 10's core on each pacing seed
// (83921, 31415, 27182), forced onto the whole lane from the start, once per P16 branch: the
// branch granted, the whistle, the branch item, the governor and the condenser owned, the earliest
// two in the slots open on a new vehicle and pressed in turn at every chance (`forkHand.ts`). On
// the median of the seeds, per branch: P1 core within 58 minutes, the slice inside 100-110 and P8
// at 45 or more (#146's pins). A miss is a balance finding for the lane's item builds, never a
// reason to retune the bot or a pin. Two branches, three seeds: six runs of hours each, so this is
// a lane (vite.config.ts leaves it out unless it is named):
//   npx vitest run src/features/tech-tree/aethericPace.lane.test.ts
const LANE = 'aetheric'
const RUN_TIMEOUT_MS = 12 * 60 * 60 * 1000
const SCENARIO_FILE = new URL('../../../scenarios/bot-slice.scenario.json', import.meta.url)
const SEEDS = PACING_WORLD_SEEDS['bot-slice']

describe('tech tree: the pacing bot forced onto the Aetheric lane', () => {
  let verdicts: LanePaceVerdict[] = []

  beforeAll(() => {
    const scenario = JSON.parse(readFileSync(SCENARIO_FILE, 'utf8')) as Scenario
    const branches = aethericBranches()
    const runs = branches.flatMap((branch) =>
      SEEDS.map((seed) => laneSeedRunOf(scenario, branch, seed)),
    )
    verdicts = branches.map((branch) => verdictOf(branch, runs))
    console.log(reportOf(runs, verdicts))
  }, RUN_TIMEOUT_MS)

  it('holds P1 core within 58 minutes, the slice to 100-110 and P8 to 45 or more on the median seed', () => {
    expect(lanePaceMissesOf(verdicts)).toEqual([])
  })
})

/** Refused with no branch registered: a lane that judged nothing would pass. */
function aethericBranches(): ForkBranchNode[] {
  const branches = registeredForkBranches().filter((branch) => branch.lane === LANE)
  if (branches.length > 0) return branches
  throw new Error('the Aetheric pace re-run refused: the lane registers no fork branch')
}

function verdictOf(branch: ForkBranchNode, runs: readonly LaneSeedRun[]): LanePaceVerdict {
  const paces = runs.filter((run) => run.branch === branch.branch).map((run) => run.lanePace)
  return lanePaceVerdictOf(branch.branch, paces)
}

function reportOf(runs: readonly LaneSeedRun[], verdicts: readonly LanePaceVerdict[]): string {
  return [
    `## The pacing bot forced onto the Aetheric lane, to planet 10's core`,
    ...runs.map(runLineOf),
    lanePaceTableOf(verdicts),
  ].join('\n')
}

function runLineOf({ branch, worldSeed, lanePace }: LaneSeedRun): string {
  const { firstCoreTicks, sliceTicks, planetTicks } = lanePace
  return (
    `${branch} seed ${worldSeed}: P1 core ${minutesOfTicks(firstCoreTicks)}, ` +
    `slice ${minutesOfTicks(sliceTicks)}, P8 ${minutesOfTicks(planetTicks)} min`
  )
}
