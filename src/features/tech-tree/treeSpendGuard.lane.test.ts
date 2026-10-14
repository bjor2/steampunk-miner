import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { PACING_WORLD_SEEDS } from '../../constants/pacingSeeds'
import { TICKS_PER_SECOND } from '../../constants/physics'
import { playSliceIntoSink } from '../../logging/sliceRunLog'
import { isFeatureUnlocked } from '../../systems/authority/featureUnlocks'
import type { AuthorityState } from '../../systems/authority/authorityState'
import type { ShopSpend } from '../../systems/bot/shopSpend'
import { spendFamiliesOf } from '../../systems/registries/spendFamilies'
import type { Scenario } from '../../systems/scenario'
import {
  brokenPinsOf,
  sharePinTableOf,
  sharePinVerdictsOf,
  type SharePinVerdict,
} from './systems/familySharePins'
import { familyShareRowsOf, familyShareTableOf, type SeedSpends } from './systems/familySpendShares'
import {
  loadoutYieldsOf,
  loadoutYieldTableOf,
  overCapLoadoutsOf,
  type LoadoutYield,
} from './systems/loadoutYieldCap'
import { laneShareRowsOf, laneShareTableOf } from './systems/nodeSpendShare'
import { registeredCatalogue } from './systems/techTree'
import {
  missedPlanetsOf,
  treeShareTableOf,
  treeShareVerdictsOf,
  type TreeShareVerdict,
} from './systems/treeSpendGuard'

// The #212 spend guard (spec #161 acceptance 6): the pacing bot plays the bot scenario to the core
// of planet 60 on each pacing seed, so the guard sees P2-P20, P21-P40 and the P41-P60 endless
// sample, and the tree's share of each planet's spend must sit inside its band on the median of
// the seeds; the kernel turret mount counts in it once (ticket 371). Each family's share pin is
// gated beside it on every planet: the armoury's recurring gun-track spend stays at or under 5%
// (GD ruling on #371). Report-only, each spend family's share from the kernel registry (GD ruling
// Q3, Q4 on #212), the one armoury row among them, printed on P2/P10/P20/P40 at zero too, and
// each of the six lanes' share (ticket 266, the sixth lane's row; no per-lane band, GD Q4). Beside
// the runs, the loadout yield cap (GD lock on #245, ticket 266): a full loadout at max Mark yields
// no more than the five lanes' maximum on P10/P20/P40/P60, the Aetheric lane adding zero.
// Headless, with no run log kept: the guard reads the bot's spend records and which family
// anchors the run opened. The runs take hours, so this is a lane (vite.config.ts leaves it out
// unless it is named):
//   npx vitest run src/features/tech-tree/treeSpendGuard.lane.test.ts   (or npm run balance:tree)
// A miss is a balance finding; the levers are #161's, in order (tech-tree.economy.json).
const LAST_PLANET = 60
/** Every live family prints on these even at zero: the armoury row's planets (Systems (c), #310). */
const REPORT_PLANETS: readonly number[] = [2, 10, 20, 40]
/** Two hours a planet, as the P200 money lane allows: a slow planet shows as a number. */
const BUDGET_TICKS = LAST_PLANET * 2 * 60 * 60 * TICKS_PER_SECOND
const RUN_TIMEOUT_MS = 12 * 60 * 60 * 1000
const SCENARIO_FILE = new URL('../../../scenarios/bot-slice.scenario.json', import.meta.url)

/** What the guard reads of one seed's run; the run itself (GBs of events) is let go. */
interface SeedRun {
  worldSeed: number
  shopSpend: readonly ShopSpend[]
  /** The spend families' anchor rows owned or unlocked when the run ended. */
  liveAnchorRowIds: ReadonlySet<string>
  endedOnPlanet: number
  isFinished: boolean
}

describe('tech tree: spend guard of the pacing bot to planet 60', () => {
  let seedRuns: SeedRun[] = []
  let verdicts: TreeShareVerdict[] = []
  let pinVerdicts: SharePinVerdict[] = []

  beforeAll(() => {
    seedRuns = PACING_WORLD_SEEDS['bot-slice'].map(playSeedToLastPlanet)
    verdicts = treeShareVerdictsOf(seedRuns.map((seedRun) => seedRun.shopSpend))
    pinVerdicts = sharePinVerdictsOf(seedRuns.map(seedSpendsOf))
    console.log(reportOf(seedRuns, verdicts, pinVerdicts))
  }, RUN_TIMEOUT_MS)

  it('plays every seed to the core of planet 60', () => {
    expect(seedRuns.filter((seedRun) => !seedRun.isFinished).map(seedLineOf)).toEqual([])
  })

  it('holds the tree share of every planet inside its band on the median of the seeds', () => {
    expect(missedPlanetsOf(verdicts).map((verdict) => verdict.planetIndex)).toEqual([])
  })

  it('holds every family share pin, the gun-track 5% among them, on the median of the seeds', () => {
    expect(brokenPinsOf(pinVerdicts).map(pinMissOf)).toEqual([])
  })
})

describe('tech tree: the loadout yield cap beside the spend guard', () => {
  it('holds a full loadout at max Mark to the five-lane maximum, the aetheric lane adding zero', () => {
    const yields = loadoutYieldsOf(registeredCatalogue())
    console.log(loadoutYieldTableOf(yields))
    expect(overCapLoadoutsOf(yields).map(loadoutMissOf)).toEqual([])
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
  const liveAnchorRowIds = liveAnchorRowIdsOf(run.state)
  return {
    worldSeed,
    shopSpend,
    liveAnchorRowIds,
    endedOnPlanet: run.state.planet.index,
    isFinished,
  }
}

function liveAnchorRowIdsOf(state: AuthorityState): ReadonlySet<string> {
  const anchorRowIds = spendFamiliesOf().map((family) => family.anchorRowId)
  return new Set(anchorRowIds.filter((rowId) => isFeatureUnlocked(state, rowId)))
}

function seedSpendsOf({ shopSpend, liveAnchorRowIds }: SeedRun): SeedSpends {
  return { shopSpend, isAnchorLive: (rowId) => liveAnchorRowIds.has(rowId) }
}

function reportOf(
  seedRuns: readonly SeedRun[],
  verdicts: readonly TreeShareVerdict[],
  pinVerdicts: readonly SharePinVerdict[],
): string {
  return [
    seedLinesOf(seedRuns),
    treeShareTableOf(verdicts),
    sharePinTableOf(pinVerdicts),
    familyTableOf(seedRuns),
    laneShareTableOf(laneShareRowsOf(seedRuns.map((seedRun) => seedRun.shopSpend))),
  ].join('\n')
}

/** Report-only: no family row fails the lane (GD ruling Q4 on #212). */
function familyTableOf(seedRuns: readonly SeedRun[]): string {
  return familyShareTableOf(familyShareRowsOf(seedRuns.map(seedSpendsOf), REPORT_PLANETS))
}

function loadoutMissOf({ planetIndex }: LoadoutYield): string {
  return `P${planetIndex}`
}

function pinMissOf({ planetIndex, familyId }: SharePinVerdict): string {
  return `P${planetIndex} ${familyId}`
}

function seedLinesOf(seedRuns: readonly SeedRun[]): string {
  return seedRuns.map(seedLineOf).join('\n')
}

function seedLineOf({ worldSeed, endedOnPlanet, isFinished }: SeedRun): string {
  return `seed ${worldSeed}: ended on planet ${endedOnPlanet}, finished: ${isFinished}`
}
