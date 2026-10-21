import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PACING_WORLD_SEEDS } from '../../constants/pacingSeeds'
import { TICKS_PER_SECOND } from '../../constants/physics'
import type { RunEvent } from '../../logging/runEvent'
import { playLoggedSliceOnSeeds, type SeededSliceRun } from '../../logging/sliceRunLog'
import type { Scenario } from '../../systems/scenario'
import { stepPlanetMissesOf, stepsFirstShownOf, type TrackPurchase } from './systems/rigLookPlanets'
import { RIG_LOOK_TABLE } from './systems/rigLookTable'

// Where the rig's look steps land in play (ticket 590; Systems' table on #157, comment
// 6300543785): the pacing gate's bot run (`logging/pacingGate.test.ts`: the bot-slice scenario on
// every pacing seed, #84) played on to planet 9's core, so the P8 rows' window closes inside it.
// On every seed each step that names a planet first shows within one planet of it, and no track
// steps twice on one planet. A miss is Systems' to retune in the row of `rigLook.json`, never the
// economy's or the bot's. Hours of headless play, so this is a lane (vite.config.ts leaves it out
// unless it is named):
//   npx vitest run src/features/rig-look/rigLookPlanets.lane.test.ts
const LAST_PLANET = 9
/** Two hours a planet, as the other planet lanes allow: past any slow seed, so a stall shows. */
const BUDGET_TICKS = LAST_PLANET * 2 * 60 * 60 * TICKS_PER_SECOND
const RUN_TIMEOUT_MS = 12 * 60 * 60 * 1000
const SCENARIO_FILE = new URL('../../../scenarios/bot-slice.scenario.json', import.meta.url)

function playGateRuns(): SeededSliceRun[] {
  const scenario = JSON.parse(readFileSync(SCENARIO_FILE, 'utf8')) as Scenario
  return playLoggedSliceOnSeeds(scenario, PACING_WORLD_SEEDS['bot-slice'], {
    lastPlanet: LAST_PLANET,
    maxTicks: BUDGET_TICKS,
  })
}

function purchasesOf(events: readonly RunEvent[]): TrackPurchase[] {
  return events.filter(isUpgradePurchase).map((event) => ({
    track: event.data.upgradeId,
    planet: event.planet,
    toLevel: event.data.toLevel,
  }))
}

function isUpgradePurchase(event: RunEvent): event is RunEvent<'upgrade_purchased'> {
  return event.event === 'upgrade_purchased'
}

function lastFinishedPlanetOf(events: readonly RunEvent[]): number {
  const finished = events.filter((event) => event.event === 'core_completed')
  return Math.max(0, ...finished.map((event) => event.planet))
}

function missesOfRun(run: SeededSliceRun): string[] {
  const purchases = purchasesOf(run.events)
  const lastFinished = lastFinishedPlanetOf(run.events)
  return RIG_LOOK_TABLE.tracks
    .flatMap((rows) => stepPlanetMissesOf(rows, purchases, lastFinished))
    .map((miss) => `seed ${run.worldSeed}: ${miss}`)
}

/** Each track's steps as `from@row->shown` per seed, for the Tester's log. */
function describeRun(run: SeededSliceRun): string {
  const purchases = purchasesOf(run.events)
  const tracks = RIG_LOOK_TABLE.tracks.map((rows) => {
    const steps = stepsFirstShownOf(rows, purchases)
    const shown = steps.map((step) => `${step.from}@P${step.rowPlanet}->P${step.shownOn ?? '-'}`)
    return `${rows.track} ${shown.join(' ')}`
  })
  return `seed ${run.worldSeed}, finished P${lastFinishedPlanetOf(run.events)}: ${tracks.join('; ')}`
}

describe('rig look steps in the pacing bot run (ticket 590)', () => {
  it(
    'first shows each step within one planet of its row, never two steps of a track on one planet',
    () => {
      const runs = playGateRuns()
      console.log(runs.map(describeRun).join('\n'))
      expect(runs.map((run) => lastFinishedPlanetOf(run.events))).toEqual(
        runs.map(() => LAST_PLANET),
      )
      expect(runs.flatMap(missesOfRun)).toEqual([])
    },
    RUN_TIMEOUT_MS,
  )
})
