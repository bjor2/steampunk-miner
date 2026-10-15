import { mkdirSync, writeFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  cutColumnAtDrillStep,
  LADDER_COLUMN,
  type DrillLadderRung,
} from '../systems/authority/drillLadder'
import { WORLD_SEED } from '../systems/authority/scriptedSession'
import { drillPowerAtStep } from '../systems/economy/vehicleStats'
import {
  formatLadderTable,
  ladderHistoryRowsOf,
  ladderStepsOf,
  type LadderSetup,
} from './drillLadderReport'
import { formatNdjsonLine } from './ndjson'

// The drill-speed ladder in stored drill_power steps (ticket 434): the cut the status page's Drill
// speed panel sets beside the browser drill-down run's descent (e2e/browser/drillDown.spec.ts), at
// the same stored steps 1, 5, 10, 15 and 20 (stored 10 is major 1). It watches and does not judge:
// #409's ladder (drillLadder.test.ts) owns the strict per-major assertion. 20 cells keeps the cut
// in the column's 24 band-1 cells, the ground a 10 s hold reaches, so descent / cut compares like
// with like. Each run writes its rows to balance-report/drill-ladder-steps.ndjson, which
// scripts/ci/recordDrillLadder.mjs appends to drill-ladder.ndjson on the test-metrics branch.
const STORED_STEPS = [1, 5, 10, 15, 20]
const COLUMN_CELLS = 20
const REPORT_FOLDER = new URL('../../balance-report/', import.meta.url)
const SETUP: LadderSetup = {
  ladder: 'drill-ladder-steps',
  planet: 1,
  worldSeed: WORLD_SEED,
  column: LADDER_COLUMN,
  cells: COLUMN_CELLS,
}
/** About 2 s on an idle box; room for a loaded one. */
const CUT_TIMEOUT_MS = 60_000

describe('drill-speed ladder in stored steps (ticket 434)', () => {
  let rungs: DrillLadderRung[] = []

  beforeAll(() => {
    rungs = STORED_STEPS.map((step) => cutColumnAtDrillStep(step, COLUMN_CELLS))
    console.log(formatLadderTable(SETUP, rungs, drillPowerAtStep))
    const rows = ladderHistoryRowsOf(SETUP, rungs, drillPowerAtStep, new Date().toISOString())
    mkdirSync(REPORT_FOLDER, { recursive: true })
    writeFileSync(
      new URL(`${SETUP.ladder}.ndjson`, REPORT_FOLDER),
      rows.map(formatNdjsonLine).join(''),
    )
  }, CUT_TIMEOUT_MS)

  it('cuts the whole band-1 column at every stored step', () => {
    expect(rungs.map(({ level, cells }) => ({ level, cells }))).toEqual(
      STORED_STEPS.map((level) => ({ level, cells: COLUMN_CELLS })),
    )
  })

  it('never cuts slower at a higher stored step', () => {
    const steps = ladderStepsOf(rungs, drillPowerAtStep)
    expect(steps.filter((step) => !step.isFaster).map(({ to }) => to)).toEqual([])
  })
})
