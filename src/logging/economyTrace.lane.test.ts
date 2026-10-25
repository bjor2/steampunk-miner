import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { PACING_WORLD_SEEDS } from '../constants/pacingSeeds'
import type { Scenario } from '../systems/scenario'
import { formatNdjsonLine } from './ndjson'
import { economyTraceLinesOf, economyTraceMarkdownOf, KIT_HANDS } from './economyTraceReport'
import { economyTraceRowsOf, type EconomyTraceRun } from './economyTraceRows'
import { economyTraceRunOf } from './economyTraceRuns'

// The P3-P5 pacing diagnosis, part 1 (ticket 907; the GD lock of 25 Oct, Campaign Scaling room):
// each pacing seed (83921, 31415, 27182) plays the bot scenario to planet 5's core with kitPolicy
// off and on, and every step folds into the per-planet economy trace (`economyTrace.ts`). Nothing
// is gated: the trace rows go to balance-report/economy-trace.ndjson and the run-comparison log to
// balance-report/economy-trace.md, which replaces docs/economy/economy-trace-p1-p5.md as the
// baseline #908 re-measures against. Six runs of up to an hour each, so this is a lane:
//   npx vitest run src/logging/economyTrace.lane.test.ts
const RUN_TIMEOUT_MS = 8 * 60 * 60 * 1000
const SCENARIO_FILE = new URL('../../scenarios/bot-slice.scenario.json', import.meta.url)
const REPORT_FOLDER = new URL('../../balance-report/', import.meta.url)
const SEEDS = PACING_WORLD_SEEDS['bot-slice']

describe('economy trace: P1-P5 on three seeds, kitPolicy off and on (ticket 907)', () => {
  let runs: EconomyTraceRun[] = []

  beforeAll(() => {
    const scenario = JSON.parse(readFileSync(SCENARIO_FILE, 'utf8')) as Scenario
    runs = KIT_HANDS.flatMap((hand) => SEEDS.map((seed) => economyTraceRunOf(scenario, seed, hand)))
    console.log(['economy trace (ticket 907)', ...economyTraceLinesOf(runs)].join('\n'))
    writeReports(runs)
  }, RUN_TIMEOUT_MS)

  it('traces every planet each run played, from planet 1 on without a gap', () => {
    const planetsOf = (run: EconomyTraceRun) => [...run.trace.planets.keys()]
    runs.forEach((run) => {
      expect(planetsOf(run)).toEqual(planetsOf(run).map((_, at) => at + 1))
    })
  })
})

/** The trace rows as NDJSON and the run-comparison log as the doc it replaces. */
function writeReports(runs: readonly EconomyTraceRun[]): void {
  const measuredOn = new Date().toISOString().slice(0, 10)
  mkdirSync(REPORT_FOLDER, { recursive: true })
  writeFileSync(
    new URL('economy-trace.ndjson', REPORT_FOLDER),
    economyTraceRowsOf(runs)
      .map((row) => formatNdjsonLine({ measuredOn, ...row }))
      .join(''),
  )
  writeFileSync(
    new URL('economy-trace.md', REPORT_FOLDER),
    `${economyTraceMarkdownOf(runs, measuredOn)}\n`,
  )
}
