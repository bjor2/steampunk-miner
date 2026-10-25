import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { PACING_WORLD_SEEDS } from '../../constants/pacingSeeds'
import { cmp, ZERO_MONEY } from '../../systems/money'
import type { Scenario } from '../../systems/scenario'
import {
  toolPaceLinesOf,
  toolPaceProblemsOf,
  toolPaceRowsOf,
  type ToolPaceRow,
} from './toolPaceBars'
import { BARE_HAND, TOOL_HANDS, toolPaceRunOf, type ToolPaceRun } from './toolPaceRuns'

// The tools on/off replay (ticket 881, PK4c T1; Systems and the VS on #850): each pacing seed
// (83921, 31415, 27182) plays the bot scenario bare to planet 5's core, and once per hazard tool to
// its home planet's core with the tool granted at the start (the flask's full stack uncorked under
// `kitPolicy.flask: 'on_firedamp_entry'`). The medians are held to `toolPaceBars.ts`: payback 1 to
// 3 times the price the grant debited, felt speed to the home core within 5% of bare, and no
// planet under 22 minutes. A miss is tuned by the tool's price in data, never its factor. Fifteen
// runs of up to an hour each, so this is a lane:
//   npx vitest run src/features/planet-kit/toolPace.lane.test.ts
const RUN_TIMEOUT_MS = 12 * 60 * 60 * 1000
const SCENARIO_FILE = new URL('../../../scenarios/bot-slice.scenario.json', import.meta.url)
const SEEDS = PACING_WORLD_SEEDS['bot-slice']

describe('planet kit: the tools on/off replay, home planets 2 to 5 (ticket 881)', () => {
  let bare: ToolPaceRun[] = []
  let tools: ToolPaceRun[][] = []
  let rows: ToolPaceRow[] = []

  beforeAll(() => {
    const scenario = JSON.parse(readFileSync(SCENARIO_FILE, 'utf8')) as Scenario
    bare = SEEDS.map((seed) => toolPaceRunOf(scenario, seed, BARE_HAND))
    tools = TOOL_HANDS.map((hand) => SEEDS.map((seed) => toolPaceRunOf(scenario, seed, hand)))
    rows = toolPaceRowsOf(bare, tools)
    console.log(['Tools on/off replay (ticket 881)', ...toolPaceLinesOf(rows)].join('\n'))
  }, RUN_TIMEOUT_MS)

  it('acts every tool on its home planet and debits its price on every seed', () => {
    expect(rows.map((row) => [row.itemId, row.actingMinutes > 0])).toEqual(
      TOOL_HANDS.map((hand) => [hand.itemId, true]),
    )
    const debits = tools.flatMap((runs) => runs.map((run) => cmp(run.ledgerDebit, ZERO_MONEY)))
    expect(debits).not.toContain(0)
  })

  it('pays each tool back 1 to 3 times its price, within 5% felt speed and over 22 minutes', () => {
    expect(toolPaceProblemsOf(rows)).toEqual([])
  })
})
