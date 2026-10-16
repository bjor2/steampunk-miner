import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PACING_WORLD_SEEDS } from '../constants/pacingSeeds'
import { TICKS_PER_SECOND } from '../constants/physics'
import { SWEPT_SPAN_CHUNKS_PER_TICK } from '../constants/terrainBudget'
import { topCuttingStepMmAt, worstSpanChunksAtStep } from '../systems/authority/spanBudget'
import { watchSaveBytesOn } from '../systems/save/saveBytesWatch'
import type { Scenario } from '../systems/scenario'
import { moneyLaneNdjsonOf, startMoneyLaneFold } from './moneyLaneLines'
import { playSliceIntoSink } from './sliceRunLog'

// The P200 money lane (ticket 340, #316 TD scope f; TD pin on #123, GD): the pacing bot plays the
// bot scenario to planet 200's core, where prices are near 1e104, headless and with no command
// log, and writes a summary log of one line a planet (about 1 MB at most, apart from the
// first-hour 8 MB gate). Its gate: every money field it logged is canonical text (#5), checked
// against the schema as each event arrives. Its largest price and income are printed. It also
// holds the per-tick authority cost budget at P200 (ticket 334, replacing the P100 acceptance of
// #316 scope b): the process's CPU time over game ticks, bot planning included, so an upper bound
// on what the authority spends a tick, stays inside the TD's 2 ms slice. And it holds the swept
// span's chunks-touched budget (ticket 335): one tick's span at the rig's top cutting step on its
// last planet, at its worst placement, crosses no more than `SWEPT_SPAN_CHUNKS_PER_TICK` chunks;
// the figure is printed so the budget can be re-set from it. It measures the save too (#470 P1-8,
// ticket 479): the largest save file cut at a checkpoint moment on planets 1, 10 and 200, printed
// and written as balance-report/save-bytes.json for
//   npm run perf:record -- --source manual --from balance-report/save-bytes.json
// The run
// takes hours, so it is a lane: vite.config.ts leaves it out unless it is named,
//   npx vitest run src/logging/moneyPastP200.lane.test.ts   (or npm run balance:money-p200)
const LANE = 'money-p200'
const LAST_PLANET = 200
/** Two hours a planet: past the 120-minute warning, so a slow planet shows as a number. */
const BUDGET_TICKS = LAST_PLANET * 2 * 60 * 60 * TICKS_PER_SECOND
/** The TD's budget for the lane's summary log: about 1 MB. */
const SUMMARY_BUDGET_BYTES = 1_000_000
/** The TD's per-tick authority slice (#316 scope b: "about 2 ms or 32 density cells"), in µs. */
const AUTHORITY_TICK_BUDGET_MICROS = 2_000
const RUN_TIMEOUT_MS = 8 * 60 * 60 * 1000
const SCENARIO_FILE = new URL('../../scenarios/bot-slice.scenario.json', import.meta.url)
const REPORT_FOLDER = new URL('../../balance-report/', import.meta.url)
/** The planets whose save size `docs/perf/metrics.json` charts as `saveBytes.p<n>`. */
const SAVE_BYTES_PLANETS = [1, 10, LAST_PLANET]

describe('money lane: the pacing bot to planet 200', () => {
  it(
    'logs only canonical money to planet 200 in a summary log of about 1 MB, inside the tick and span budgets',
    () => {
      const scenario = JSON.parse(readFileSync(SCENARIO_FILE, 'utf8')) as Scenario
      const [worldSeed] = PACING_WORLD_SEEDS['bot-slice']
      const fold = startMoneyLaneFold()
      const saveBytes = watchSaveBytesOn(SAVE_BYTES_PLANETS)
      const cpuBefore = process.cpuUsage()
      const run = playSliceIntoSink(
        { ...scenario, worldSeed },
        { append: fold.add, appendCommand: () => undefined },
        { lastPlanet: LAST_PLANET, maxTicks: BUDGET_TICKS, watchEvents: saveBytes.note },
      )
      const microsPerTick = cpuMicrosSince(cpuBefore) / Math.max(1, run.state.tick)
      const topStepMm = topCuttingStepMmAt(run.state, 'p1')
      const spanChunks = worstSpanChunksAtStep(topStepMm)
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
      const saveMetrics = saveBytesMetricsOf(saveBytes.largestBytesByPlanet())
      writeFileSync(new URL('save-bytes.json', REPORT_FOLDER), JSON.stringify(saveMetrics))
      console.log(`${LANE}: largest save bytes ${JSON.stringify(saveMetrics.metrics)}`)
      console.log(
        `${LANE}: seed ${worldSeed}, ended on planet ${run.state.planet.index} (finished: ${run.isFinished}); largest price ${summary.largestPrice}, largest income ${summary.largestIncome}, largest amount ${summary.largestMoney}; ${Buffer.byteLength(text)} bytes; ${Math.round(microsPerTick)} µs CPU a tick; top cutting step ${topStepMm} mm a tick, its span ${spanChunks} chunks (budget ${SWEPT_SPAN_CHUNKS_PER_TICK})`,
      )
      expect(summary.problems).toEqual([])
      expect(run.isFinished).toBe(true)
      expect(Buffer.byteLength(text)).toBeLessThanOrEqual(SUMMARY_BUDGET_BYTES)
      expect(microsPerTick).toBeLessThanOrEqual(AUTHORITY_TICK_BUDGET_MICROS)
      expect(spanChunks).toBeLessThanOrEqual(SWEPT_SPAN_CHUNKS_PER_TICK)
    },
    RUN_TIMEOUT_MS,
  )
})

/** `{"metrics": {"saveBytes.p1": n, ...}}`, the file shape `perf:record --from` reads. */
function saveBytesMetricsOf(bytesByPlanet: ReadonlyMap<number, number>) {
  const ids = [...bytesByPlanet].map(([planet, bytes]) => [`saveBytes.p${planet}`, bytes])
  return { metrics: Object.fromEntries(ids) as Record<string, number> }
}

/** CPU time, not wall time, so a loaded shared box does not count other processes' work. */
function cpuMicrosSince(before: NodeJS.CpuUsage): number {
  const { user, system } = process.cpuUsage(before)
  return user + system
}
