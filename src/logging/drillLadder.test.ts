import { mkdirSync, writeFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  cutColumnAtDrillLevel,
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
// planet 1 surface of the spec seed, cut at drill_power 1, 5, 10, 15 and 20 with the #396 drill
// law and #399's exact carry. It prints the table, logs it to balance-report/drill-ladder.ndjson
// for comparing runs across commits, and holds each step up the ladder to the law's 1.12 a level
// compounded, less the GD's 5% (#396). The cut alone sets the time until #397's cut-follow adds
// the vehicle's travel to it. The table lives in docs/economy/drill-ladder.md.
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
    rungs = LADDER_LEVELS.map((level) => cutColumnAtDrillLevel(level, COLUMN_CELLS))
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

  it("makes each step a felt gain: the law's 1.12 a level compounded, less 5%", () => {
    const felt = ladderStepsOf(rungs).map(({ to, isClearlyFelt }) => ({ to, isClearlyFelt }))
    expect(felt).toEqual(LADDER_LEVELS.slice(1).map((to) => ({ to, isClearlyFelt: true })))
  })
})
