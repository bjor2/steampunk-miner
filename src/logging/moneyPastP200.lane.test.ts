import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PACING_WORLD_SEEDS } from '../constants/pacingSeeds'
import { TICKS_PER_SECOND } from '../constants/physics'
import type { Scenario } from '../systems/scenario'
import { moneyLaneNdjsonOf, startMoneyLaneFold } from './moneyLaneLines'
import { playSliceIntoSink } from './sliceRunLog'

// The P200 money lane (ticket 340, #316 TD scope f; TD pin on #123, GD): the pacing bot plays the
// bot scenario to planet 200's core, where prices are near 1e104, headless and with no command
// log, and writes a summary log of one line a planet (about 1 MB at most, apart from the
// first-hour 4 MB gate). Its gate: every money field it logged is canonical text (#5), checked
// against the schema as each event arrives. Its largest price and income are printed. The run
// takes hours, so it is a lane: vite.config.ts leaves it out unless it is named,
//   npx vitest run src/logging/moneyPastP200.lane.test.ts   (or npm run balance:money-p200)
const LANE = 'money-p200'
const LAST_PLANET = 200
/** Two hours a planet: past the 120-minute warning, so a slow planet shows as a number. */
const BUDGET_TICKS = LAST_PLANET * 2 * 60 * 60 * TICKS_PER_SECOND
/** The TD's budget for the lane's summary log: about 1 MB. */
const SUMMARY_BUDGET_BYTES = 1_000_000
const RUN_TIMEOUT_MS = 8 * 60 * 60 * 1000
const SCENARIO_FILE = new URL('../../scenarios/bot-slice.scenario.json', import.meta.url)
const REPORT_FOLDER = new URL('../../balance-report/', import.meta.url)

describe('money lane: the pacing bot to planet 200', () => {
  it(
    'logs only canonical money to planet 200 in a summary log of about 1 MB',
    () => {
      const scenario = JSON.parse(readFileSync(SCENARIO_FILE, 'utf8')) as Scenario
      const [worldSeed] = PACING_WORLD_SEEDS['bot-slice']
      const fold = startMoneyLaneFold()
      const run = playSliceIntoSink(
        { ...scenario, worldSeed },
        { append: fold.add, appendCommand: () => undefined },
        { lastPlanet: LAST_PLANET, maxTicks: BUDGET_TICKS },
      )
      const summary = fold.summarize()
      const text = moneyLaneNdjsonOf(
        {
          lane: LANE,
          worldSeed,
          lastPlanet: LAST_PLANET,
          isFinished: run.isFinished,
          endedOnPlanet: run.state.planet.index,
          endTick: run.state.tick,
        },
        summary,
      )
      mkdirSync(REPORT_FOLDER, { recursive: true })
      writeFileSync(new URL(`${LANE}.ndjson`, REPORT_FOLDER), text)
      console.log(
        `${LANE}: seed ${worldSeed}, ended on planet ${run.state.planet.index} (finished: ${run.isFinished}); largest price ${summary.largestPrice}, largest income ${summary.largestIncome}, largest amount ${summary.largestMoney}; ${Buffer.byteLength(text)} bytes`,
      )
      expect(summary.problems).toEqual([])
      expect(run.isFinished).toBe(true)
      expect(Buffer.byteLength(text)).toBeLessThanOrEqual(SUMMARY_BUDGET_BYTES)
    },
    RUN_TIMEOUT_MS,
  )
})
