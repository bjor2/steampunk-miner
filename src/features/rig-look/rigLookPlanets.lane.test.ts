import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PACING_WORLD_SEEDS } from '../../constants/pacingSeeds'
import { TICKS_PER_SECOND } from '../../constants/physics'
import type { RunEvent } from '../../logging/runEvent'
import { playLoggedSliceOnSeeds, type SeededSliceRun } from '../../logging/sliceRunLog'
import type { Scenario } from '../../systems/scenario'
import { bandStepOf, medianTwoPlanetBuysOf } from './systems/render/rigLookBands'
import {
  cadenceWarningOf,
  edgesFirstReachedOf,
  purchasesPerPlanetOf,
  type TrackPurchase,
} from './systems/rigLookPlanets'
import { RIG_LOOK_TABLE } from './systems/rigLookTable'

// Where the rig's look bands land in play (ticket 809, replacing ticket 590's per-step planets;
// VS via Systems on #809): the pacing gate's bot run (`logging/pacingGate.test.ts`: the bot-slice
// scenario on every pacing seed, #84) played on to planet 8's core, the reach of the traces the
// edges were frozen from. For each line it prints the purchases a planet on every seed, the planet
// each edge was first reached on, the two-planet median the VS rule takes and the step it gives
// beside the frozen one; and the fuel tank's purchases a planet, which the VS asked logged. A line
// outside 1 to 3 planets a band, a measured step off the frozen one and a median bot that buys no
// tank level are warnings for the VS (a fuel/tank curve finding for the last), never a failure:
// the edges are frozen data. Only a run that stalls before P8's core fails. Hours of headless play,
// so this is a lane (vite.config.ts leaves it out unless it is named):
//   npx vitest run src/features/rig-look/rigLookPlanets.lane.test.ts
const LAST_PLANET = 8
/** Two hours a planet, as the other planet lanes allow: past any slow seed, so a stall shows. */
const BUDGET_TICKS = LAST_PLANET * 2 * 60 * 60 * TICKS_PER_SECOND
const RUN_TIMEOUT_MS = 12 * 60 * 60 * 1000
const SCENARIO_FILE = new URL('../../../scenarios/bot-slice.scenario.json', import.meta.url)
const FUEL_TANK = 'fuel_tank'

function playGateRuns(): SeededSliceRun[] {
  const scenario = JSON.parse(readFileSync(SCENARIO_FILE, 'utf8')) as Scenario
  return playLoggedSliceOnSeeds(scenario, PACING_WORLD_SEEDS['bot-slice'], {
    lastPlanet: LAST_PLANET,
    maxTicks: BUDGET_TICKS,
  })
}

/** Every track purchase of the run, the fuel tank's as track `fuel_tank`. */
function purchasesOf(events: readonly RunEvent[]): TrackPurchase[] {
  return events.flatMap((event): TrackPurchase[] => {
    if (isUpgradePurchase(event)) {
      return [{ track: event.data.upgradeId, planet: event.planet, toLevel: event.data.toLevel }]
    }
    if (isTankPurchase(event)) {
      return [{ track: FUEL_TANK, planet: event.planet, toLevel: event.data.level }]
    }
    return []
  })
}

function isUpgradePurchase(event: RunEvent): event is RunEvent<'upgrade_purchased'> {
  return event.event === 'upgrade_purchased'
}

function isTankPurchase(event: RunEvent): event is RunEvent<'fuel_tank_bought'> {
  return event.event === 'fuel_tank_bought'
}

function lastFinishedPlanetOf(events: readonly RunEvent[]): number {
  const finished = events.filter((event) => event.event === 'core_completed')
  return Math.max(0, ...finished.map((event) => event.planet))
}

/** Each line's buys a planet, its edges' first planets and its measured step, per seed. */
function describeLines(runs: readonly SeededSliceRun[]): string[] {
  return RIG_LOOK_TABLE.tracks.map((rows) => {
    const perSeed = runs.map((run) =>
      purchasesPerPlanetOf(rows.track, purchasesOf(run.events), LAST_PLANET),
    )
    const measured = bandStepOf(rows.band.decadeStep, medianTwoPlanetBuysOf(perSeed))
    const edges = runs.map((run) =>
      edgesFirstReachedOf(rows, purchasesOf(run.events))
        .map((edge) => `${edge.edge}@P${edge.planet ?? '-'}`)
        .join(' '),
    )
    return `${rows.track}: step ${rows.band.step} frozen, ${measured} measured; buys ${JSON.stringify(perSeed)}; edges ${edges.join(' | ')}`
  })
}

function warningsOf(runs: readonly SeededSliceRun[]): string[] {
  return [...cadenceWarningsOf(runs), ...measuredStepWarningsOf(runs), ...tankWarningsOf(runs)]
}

function cadenceWarningsOf(runs: readonly SeededSliceRun[]): string[] {
  return runs.flatMap((run) =>
    RIG_LOOK_TABLE.tracks.flatMap((rows) => {
      const warning = cadenceWarningOf(
        rows,
        purchasesOf(run.events),
        lastFinishedPlanetOf(run.events),
      )
      return warning === null ? [] : [`seed ${run.worldSeed}: ${warning}`]
    }),
  )
}

function measuredStepWarningsOf(runs: readonly SeededSliceRun[]): string[] {
  return RIG_LOOK_TABLE.tracks.flatMap((rows) => {
    const perSeed = runs.map((run) =>
      purchasesPerPlanetOf(rows.track, purchasesOf(run.events), LAST_PLANET),
    )
    const measured = bandStepOf(rows.band.decadeStep, medianTwoPlanetBuysOf(perSeed))
    return measured === rows.band.step
      ? []
      : [`${rows.track}: main measures step ${measured}, frozen ${rows.band.step}`]
  })
}

/** The VS asked: a median bot that buys no tank level is a fuel/tank curve finding. */
function tankWarningsOf(runs: readonly SeededSliceRun[]): string[] {
  const perSeed = runs.map((run) =>
    purchasesPerPlanetOf(FUEL_TANK, purchasesOf(run.events), LAST_PLANET),
  )
  const totals = perSeed
    .map((buys) => buys.reduce((sum, each) => sum + each, 0))
    .sort((a, b) => a - b)
  const median = totals[Math.floor(totals.length / 2)] ?? 0
  const line = `fuel tank buys a planet ${JSON.stringify(perSeed)}`
  return median === 0
    ? [`${line}: the median bot buys no tank level (VS: fuel/tank curve finding)`]
    : []
}

describe('rig look bands in the pacing bot run (ticket 809)', () => {
  it(
    'plays every seed to P8 and prints each line’s bands, cadence and tank buys for the VS',
    () => {
      const runs = playGateRuns()
      console.log(describeLines(runs).join('\n'))
      const warnings = warningsOf(runs)
      if (warnings.length > 0) console.warn(`rig look warnings:\n${warnings.join('\n')}`)
      expect(runs.map((run) => lastFinishedPlanetOf(run.events))).toEqual(
        runs.map(() => LAST_PLANET),
      )
    },
    RUN_TIMEOUT_MS,
  )
})
