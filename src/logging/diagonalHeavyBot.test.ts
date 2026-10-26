import { describe, expect, it } from 'vitest'
import { TICKS_PER_SECOND } from '../constants/physics'
import { createAuthorityState } from '../systems/authority/authorityState'
import { createBotSession } from '../systems/bot/botSession'
import { botPlanetOf } from '../systems/bot/botTravel'
import { DEFAULT_KIT_POLICY } from '../systems/bot/botCrates'
import { DEFAULT_BORE_POLICY } from '../systems/bot/botBore'
import type { DigPolicy } from '../systems/bot/mineLayout'
import { playSliceFrom, type SliceRun } from '../systems/bot/playSlice'
import { newDownBoreTally } from '../systems/bot/downBores'
import { newSidewaysBoreTally } from '../systems/bot/sidewaysBores'
import {
  diagonalShareBpOf,
  emptyDigTally,
  tallyDigCommand,
  tallyDigStep,
  type DigTally,
} from './diagonalDig'

// Ticket 899: the diagonal-heavy bot on planet 1 of one pacing seed, the quick check beside the
// lane (`diagonalHeavy.lane.test.ts`, P1-P5 on three seeds): it reaches the core cutting at least
// half its tunnel at 45°, every command accepted, its lining billed by the per-metre rule alone,
// and plays the same commands twice from the same seed.

const WORLD_SEED = 83921
const PLAYER = 'p1'
/** Two hours: past planet 1's 30-minute target, so a slow planet shows as a miss, not a hang. */
const BUDGET_TICKS = 2 * 60 * 60 * TICKS_PER_SECOND
/** A few minutes of play, for the determinism check. */
const SHORT_TICKS = 10 * 60 * TICKS_PER_SECOND

interface DugRun {
  run: SliceRun
  dig: DigTally
}

function playPlanetOne(digPolicy: DigPolicy, maxTicks = BUDGET_TICKS): DugRun {
  const dig = emptyDigTally()
  const start = createAuthorityState({
    planetIndex: 1,
    planetSeed: WORLD_SEED,
    playerIds: [PLAYER],
  })
  const session = createBotSession(start, PLAYER, {
    onCommand: (command) => tallyDigCommand(dig, command),
    onEvents: (state, events) => tallyDigStep(dig, state, PLAYER, events),
  })
  const planet = botPlanetOf(
    session,
    'blast',
    [],
    DEFAULT_BORE_POLICY,
    newSidewaysBoreTally(),
    newDownBoreTally(),
    DEFAULT_KIT_POLICY,
    digPolicy,
  )
  const run = playSliceFrom(session, planet, { lastPlanet: 1, maxTicks })
  return { run, dig }
}

let diagonal: DugRun | null = null
const diagonalRun = (): DugRun => (diagonal ??= playPlanetOne('diagonal_heavy'))

describe('diagonal-heavy pacing bot on planet 1 (ticket 899)', () => {
  it('reaches the core inside its budget with every command accepted', () => {
    const { run } = diagonalRun()
    expect(run.isFinished).toBe(true)
    expect(run.events.filter((event) => event.type === 'CommandRejected')).toEqual([])
  })

  it('cuts at least half its tunnel at 45 degrees', () => {
    const planet = diagonalRun().dig.planets.get(1)
    expect(planet).toBeDefined()
    expect(diagonalShareBpOf(planet!)).toBeGreaterThanOrEqual(5000)
  })

  it('bills its lining by the per-metre rule alone, with no term for the angle', () => {
    const planet = diagonalRun().dig.planets.get(1)!
    expect(planet.billedMm).toBeGreaterThan(0)
    expect(planet.offRulePrices).toBe(0)
  })

  it('plays the same commands twice from the same seed', () => {
    const first = playPlanetOne('diagonal_heavy', SHORT_TICKS).run.commands
    const second = playPlanetOne('diagonal_heavy', SHORT_TICKS).run.commands
    expect(second).toEqual(first)
  })

  it('cuts no tunnel at 45 degrees under the default dig policy', () => {
    const planet = playPlanetOne('cardinal', SHORT_TICKS).dig.planets.get(1)!
    expect(planet.diagonalTiles).toBe(0)
  })
})
