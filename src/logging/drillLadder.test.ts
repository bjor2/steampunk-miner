import { mkdirSync, writeFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  cutColumnAtDrillStep,
  LADDER_COLUMN,
  type DrillLadderRung,
} from '../systems/authority/drillLadder'
import { WORLD_SEED } from '../systems/authority/scriptedSession'
import {
  formatLadderTable,
  ladderNdjsonOf,
  ladderStepsOf,
  type LadderSetup,
} from './drillLadderReport'

// The drill-speed ladder (ticket 409, Bjor 14 Oct): the same 50 cells straight down from the
// planet 1 surface of the spec seed, cut at drill_power 1, 5, 10, 15 and 20 (purchases since the
// GD ruling on #551, ticket 552) with #399's exact carry. It prints the table, logs it to
// balance-report/drill-ladder.ndjson for comparing runs across commits, and holds each step up the
// ladder to 1.181 to 1.305 a purchase compounded (the #463 bar since #552, in place of #396's 1.12
// +-5% a major). The cut alone sets the time. The table lives in docs/economy/drill-ladder.md.
const LADDER_LEVELS = [1, 5, 10, 15, 20]
const COLUMN_CELLS = 50
const REPORT_FOLDER = new URL('../../balance-report/', import.meta.url)
const SETUP: LadderSetup = {
  ladder: 'drill-ladder',
  planet: 1,
  worldSeed: WORLD_SEED,
  column: LADDER_COLUMN,
  cells: COLUMN_CELLS,
}
/** About 4 s on an idle box; room for a loaded one. */
const CUT_TIMEOUT_MS = 60_000

describe('drill-speed ladder (ticket 409)', () => {
  let rungs: DrillLadderRung[] = []

  beforeAll(() => {
    rungs = LADDER_LEVELS.map((level) => cutColumnAtDrillStep(level, COLUMN_CELLS))
    console.log(formatLadderTable(SETUP, rungs))
    mkdirSync(REPORT_FOLDER, { recursive: true })
    writeFileSync(new URL(`${SETUP.ladder}.ndjson`, REPORT_FOLDER), ladderNdjsonOf(SETUP, rungs))
  }, CUT_TIMEOUT_MS)

  it('cuts the whole column at every level', () => {
    expect(rungs.map(({ level, cells }) => ({ level, cells }))).toEqual(
      LADDER_LEVELS.map((level) => ({ level, cells: COLUMN_CELLS })),
    )
  })

  it('cuts the column strictly faster at each level up the ladder', () => {
    const faster = ladderStepsOf(rungs).map(({ to, isFaster }) => ({ to, isFaster }))
    expect(faster).toEqual(LADDER_LEVELS.slice(1).map((to) => ({ to, isFaster: true })))
  })

  it('gains 1.181 to 1.305 a purchase, compounded, on each step up the ladder (#552)', () => {
    const felt = ladderStepsOf(rungs).map(({ to, isInPurchaseBand }) => ({ to, isInPurchaseBand }))
    expect(felt).toEqual(LADDER_LEVELS.slice(1).map((to) => ({ to, isInPurchaseBand: true })))
  })
})
