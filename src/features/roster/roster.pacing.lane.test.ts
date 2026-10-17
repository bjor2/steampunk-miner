import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PACING_WORLD_SEEDS } from '../../constants/pacingSeeds'
import type { CommandIntent } from '../../systems/authority/authorityCommand'
import { createAuthorityState, type AuthorityState } from '../../systems/authority/authorityState'
import type { DomainEvent } from '../../systems/authority/domainEvent'
import { TICKS_PER_SECOND } from '../../constants/physics'
import { playSlice } from '../../systems/bot/playSlice'
import { startOfScenario, type Scenario } from '../../systems/scenario'
import { startScenarioCommands } from '../../systems/startScenarioCommands'
import { withRosterOff } from './rosterFixtures'

// Part D of `roster.byteIdentity.test` (TD ruling on ticket 446, 6226236698 section 5 D, and the
// Vertical Scaler's additions in 6226264758): on each pacing seed the bot plays the bot scenario
// to planet 1's core three ways: with the roster (this build), with the fold off (main's cells), and
// from an old save's planet 1 (unstamped: the legacy rows, no roster). The first drill purchase may
// come at most 5% later than with the fold off, and every run's first purchase and time to core are
// printed beside it. Headless bot runs, so this is a lane, run only when named:
//   npx vitest run src/features/roster/roster.pacing.lane.test.ts
// A miss is a balance finding, never a reason to retune the bot or a constant.

const SCENARIO_FILE = new URL('../../../scenarios/bot-slice.scenario.json', import.meta.url)
const PLAYER_ID = 'p1'
/** Planet 1's core is due in 15 to 30 minutes; two hours leaves room to see a miss. */
const BUDGET_TICKS = 2 * 60 * 60 * TICKS_PER_SECOND
const LATER_LIMIT_PERCENT = 5
const RUN_TIMEOUT_MS = 60 * 60 * 1000

interface PaceLine {
  seed: number
  run: string
  firstDrillTick: number | null
  coreTick: number | null
}

function scenarioOf(): Scenario {
  return JSON.parse(readFileSync(SCENARIO_FILE, 'utf8')) as Scenario
}

function startCommandsOf(scenario: Scenario): CommandIntent[] {
  const { planetSeed: _sessionSeed, ...start } = startOfScenario(scenario)
  return startScenarioCommands(start)
}

function freshStart(seed: number): AuthorityState {
  return createAuthorityState({ planetIndex: 1, planetSeed: seed, playerIds: [PLAYER_ID] })
}

/** Planet 1 as a save written before the ore rules holds it: no stamp, so no roster. */
function oldSaveStart(seed: number): AuthorityState {
  const state = freshStart(seed)
  return { ...state, planet: { index: 1, seed } }
}

function paceLineOf(seed: number, run: string, start: AuthorityState): PaceLine {
  const { events } = playSlice(start, {
    maxTicks: BUDGET_TICKS,
    lastPlanet: 1,
    playerId: PLAYER_ID,
    startCommands: startCommandsOf(scenarioOf()),
  })
  return { seed, run, firstDrillTick: firstDrillTickOf(events), coreTick: coreTickOf(events) }
}

function firstDrillTickOf(events: readonly DomainEvent[]): number | null {
  const bought = events.find(
    (event) => event.type === 'UpgradeLevelChanged' && event.upgradeId === 'drill_power',
  )
  return bought?.tick ?? null
}

function coreTickOf(events: readonly DomainEvent[]): number | null {
  return events.find((event) => event.type === 'CoreCompleted')?.tick ?? null
}

function minutesOf(tick: number | null): string {
  return tick === null ? 'never' : (tick / TICKS_PER_SECOND / 60).toFixed(2)
}

function formatLine(line: PaceLine): string {
  const drill = minutesOf(line.firstDrillTick)
  return `seed ${line.seed} ${line.run}: first drill ${drill} min, core ${minutesOf(line.coreTick)} min`
}

/** How much later, in percent, the roster's first drill purchase comes than the fold-off one's. */
function laterPercentOf(roster: PaceLine, foldOff: PaceLine): number {
  if (roster.firstDrillTick === null || foldOff.firstDrillTick === null) return Infinity
  return ((roster.firstDrillTick - foldOff.firstDrillTick) * 100) / foldOff.firstDrillTick
}

describe('roster pacing lane: D, planet 1 first drill purchase (ticket 446)', () => {
  it(
    'buys the first drill at most 5% later with the roster than with the fold off, old save beside',
    () => {
      const seeds = PACING_WORLD_SEEDS['bot-slice']
      const lines = seeds.map((seed) => ({
        roster: paceLineOf(seed, 'roster', freshStart(seed)),
        foldOff: withRosterOff(() => paceLineOf(seed, 'fold off', freshStart(seed))),
        oldSave: paceLineOf(seed, 'old save', oldSaveStart(seed)),
      }))
      for (const { roster, foldOff, oldSave } of lines)
        console.log([roster, foldOff, oldSave].map(formatLine).join('\n'))
      const late = lines.filter(
        ({ roster, foldOff }) => laterPercentOf(roster, foldOff) > LATER_LIMIT_PERCENT,
      )
      expect(late.map(({ roster }) => roster.seed)).toEqual([])
    },
    RUN_TIMEOUT_MS,
  )
})
