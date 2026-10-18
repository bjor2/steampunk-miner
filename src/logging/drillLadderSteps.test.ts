import { mkdirSync, writeFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  cutColumnAtDrillStep,
  LADDER_COLUMN,
  type DrillLadderRung,
} from '../systems/authority/drillLadder'
import { WORLD_SEED } from '../systems/authority/scriptedSession'
import { DRILL_SUBSTEPS_PER_TICK } from '../constants/balance'
import { TICKS_PER_SECOND } from '../constants/physics'
import { blockHardness } from '../systems/economy/oreEconomy'
import { startLevels, vehicleStatsAt } from '../systems/economy/vehicleStats'
import { cmp, div, fromCanonical, fromSafeInteger, mul, toFixedText } from '../systems/money'
import { subStepsPerTile } from '../systems/vehicle/drillRule'
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
// #409's ladder (drillLadder.test.ts) owns the per-purchase band. 20 cells keeps the cut in the
// column's 24 band-1 cells, so descent / cut compares like with like. Each run writes its rows to
// balance-report/drill-ladder-steps.ndjson, which scripts/ci/recordDrillLadder.mjs appends to
// drill-ladder.ndjson on the test-metrics branch.
//
// Since the GD ruling on #551 (ticket 552) a stored step is one purchase, and two bars read this
// cut: stored 20 against stored 1 within [55, 70] (Systems' acceptance 1), and the stored-20 cut on
// band 1 between -2.7% and +0.5% of the law's D(20) (VS's bench bar (ii), split by the TD): a cell
// is paid in ceil(3600 H^3 / (D P^2)) sub-steps, which can only slow the cut. The test prints the
// band-1 hardness and the tip it used and works the expected quantisation out from them; the
// browser's metres per second down at level 20 are #560's bench.
const LAW_STEP = 20
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
    console.log(formatLadderTable(SETUP, rungs))
    const rows = ladderHistoryRowsOf(SETUP, rungs, new Date().toISOString())
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
    const steps = ladderStepsOf(rungs)
    expect(steps.filter((step) => !step.isFaster).map(({ to }) => to)).toEqual([])
  })

  it('cuts the band-1 column 55 to 70 times faster at stored 20 than at stored 1 (#552)', () => {
    const [first, last] = [rungs[0], rungs[rungs.length - 1]]
    const ratio = div(fromSafeInteger(first.ticks), fromSafeInteger(last.ticks))
    expect([cmp(ratio, fromSafeInteger(55)) >= 0, cmp(ratio, fromSafeInteger(70)) <= 0]).toEqual([
      true,
      true,
    ])
  })

  it("cuts band 1 at stored 20 within -2.7% and +0.5% of the law's D(20), as the sub-steps quantise it (#552)", () => {
    const rung = rungs.find(({ level }) => level === LAW_STEP)!
    const reading = quantisationAt(LAW_STEP)
    console.log(
      `stored ${LAW_STEP} on band 1: hardness ${reading.hardness}, tip ${reading.tip}, ` +
        `law ${reading.law} cells/s, ${reading.subSteps} sub-steps a cell, ` +
        `expected ${reading.expected} cells/s, cut ${toFixedText(cellsPerSecondOf(rung), 3)}`,
    )
    const offLaw = div(cellsPerSecondOf(rung), fromCanonical(reading.law))
    expect([
      cmp(offLaw, fromCanonical('0.973')) >= 0,
      cmp(offLaw, fromCanonical('1.005')) <= 0,
    ]).toEqual([true, true])
    expect(toFixedText(cellsPerSecondOf(rung), 3)).toBe(reading.expected)
  })
})

/** The band-1 law at a stored step with the ladder's tip 0, and the cut its sub-steps allow. */
function quantisationAt(step: number) {
  const stats = vehicleStatsAt({ ...startLevels(), drill_power: step })
  const hardness = blockHardness(SETUP.planet, 1)
  const subSteps = subStepsPerTile(stats, hardness)!
  const perSecond = fromSafeInteger(DRILL_SUBSTEPS_PER_TICK * TICKS_PER_SECOND)
  return {
    hardness: toFixedText(hardness, 4),
    tip: toFixedText(stats.drillTip, 4),
    law: toFixedText(div(stats.drillPower, hardness), 6),
    subSteps,
    expected: toFixedText(div(perSecond, fromSafeInteger(subSteps)), 3),
  }
}

function cellsPerSecondOf(rung: DrillLadderRung) {
  return div(
    mul(fromSafeInteger(rung.cells), fromSafeInteger(TICKS_PER_SECOND)),
    fromSafeInteger(rung.ticks),
  )
}
