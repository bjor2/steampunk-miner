import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PACING_WORLD_SEEDS } from '../../../constants/pacingSeeds'
import { TICKS_PER_SECOND } from '../../../constants/physics'
import { playLoggedSlice } from '../../../logging/sliceRunLog'
import type { Scenario } from '../../../systems/scenario'
import { withFixtureTree } from '../treeTestSession'
import { nodeSpendRowsOf, nodeSpendTableOf } from './nodeSpendShare'

// The #165 diagnostic (Vertical Scaler, GD split): the pacing bot plays the bot scenario to the
// core of planet 20 with the #161 fixture tree registered and prints the nodes-only spend share
// per planet. Reported, never gated (#212 owns the guard). It takes many minutes, so it runs only
// when asked:  TECH_TREE_SPEND_DIAGNOSTIC=1 npx vitest run nodeSpendShare.diagnostic
const IS_ASKED = process.env.TECH_TREE_SPEND_DIAGNOSTIC === '1'
const LAST_PLANET = 20
const BUDGET_TICKS = 40 * 60 * 60 * TICKS_PER_SECOND
const SCENARIO_FILE = new URL('../../../../scenarios/bot-slice.scenario.json', import.meta.url)

describe('tech tree: nodes-only spend share of the pacing bot (diagnostic)', () => {
  it.skipIf(!IS_ASKED)(
    'prints the share per planet to planet 20',
    () => {
      const scenario = JSON.parse(readFileSync(SCENARIO_FILE, 'utf8')) as Scenario
      const [worldSeed] = PACING_WORLD_SEEDS['bot-slice']
      const { run } = withFixtureTree(() =>
        playLoggedSlice(
          { ...scenario, worldSeed },
          { lastPlanet: LAST_PLANET, maxTicks: BUDGET_TICKS },
        ),
      )
      const rows = nodeSpendRowsOf(run.shopSpend)
      console.log(`seed ${worldSeed}, finished: ${run.isFinished}\n${nodeSpendTableOf(rows)}`)
      expect(rows.length).toBeGreaterThan(0)
    },
    4 * 60 * 60 * 1000,
  )
})
