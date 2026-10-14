import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { PACING_WORLD_SEEDS } from '../../constants/pacingSeeds'
import { TICKS_PER_SECOND } from '../../constants/physics'
import { playSliceIntoSink } from '../../logging/sliceRunLog'
import type { ShopSpend } from '../../systems/bot/shopSpend'
import type { Scenario } from '../../systems/scenario'
import {
  missedPlanetsOf,
  treeShareTableOf,
  treeShareVerdictsOf,
  type TreeShareVerdict,
} from './systems/treeSpendGuard'

// The #212 spend guard (spec #161 acceptance 6): the pacing bot plays the bot scenario to the core
// of planet 60 on each pacing seed, so the guard sees P2-P20, P21-P40 and the P41-P60 endless
// sample, and the tree's share of each planet's spend must sit inside its band on the median of
// the seeds. Headless, with no run log kept: the guard reads the bot's spend records. The runs
// take hours, so this is a lane (vite.config.ts leaves it out unless it is named):
//   npx vitest run src/features/tech-tree/treeSpendGuard.lane.test.ts   (or npm run balance:tree)
// A miss is a balance finding; the levers are #161's, in order (tech-tree.economy.json).
const LAST_PLANET = 60
/** Two hours a planet, as the P200 money lane allows: a slow planet shows as a number. */
const BUDGET_TICKS = LAST_PLANET * 2 * 60 * 60 * TICKS_PER_SECOND
const RUN_TIMEOUT_MS = 12 * 60 * 60 * 1000
const SCENARIO_FILE = new URL('../../../scenarios/bot-slice.scenario.json', import.meta.url)

/** What the guard reads of one seed's run; the run itself (GBs of events) is let go. */
interface SeedRun {
  worldSeed: number
  shopSpend: readonly ShopSpend[]
  endedOnPlanet: number
  isFinished: boolean
}

describe('tech tree: spend guard of the pacing bot to planet 60', () => {
  let seedRuns: SeedRun[] = []
  let verdicts: TreeShareVerdict[] = []

  beforeAll(() => {
    seedRuns = PACING_WORLD_SEEDS['bot-slice'].map(playSeedToLastPlanet)
    verdicts = treeShareVerdictsOf(seedRuns.map((seedRun) => seedRun.shopSpend))
    console.log(`${seedLinesOf(seedRuns)}\n${treeShareTableOf(verdicts)}`)
  }, RUN_TIMEOUT_MS)

  it('plays every seed to the core of planet 60', () => {
    expect(seedRuns.filter((seedRun) => !seedRun.isFinished).map(seedLineOf)).toEqual([])
  })

  it('holds the tree share of every planet inside its band on the median of the seeds', () => {
    expect(missedPlanetsOf(verdicts).map((verdict) => verdict.planetIndex)).toEqual([])
  })
})

function playSeedToLastPlanet(worldSeed: number): SeedRun {
  const scenario = JSON.parse(readFileSync(SCENARIO_FILE, 'utf8')) as Scenario
  const run = playSliceIntoSink(
    { ...scenario, worldSeed },
    { append: () => undefined, appendCommand: () => undefined },
    { lastPlanet: LAST_PLANET, maxTicks: BUDGET_TICKS },
  )
  const { shopSpend, isFinished } = run
  return { worldSeed, shopSpend, endedOnPlanet: run.state.planet.index, isFinished }
}

function seedLinesOf(seedRuns: readonly SeedRun[]): string {
  return seedRuns.map(seedLineOf).join('\n')
}

function seedLineOf({ worldSeed, endedOnPlanet, isFinished }: SeedRun): string {
  return `seed ${worldSeed}: ended on planet ${endedOnPlanet}, finished: ${isFinished}`
}
