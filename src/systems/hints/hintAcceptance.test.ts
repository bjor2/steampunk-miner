import { describe, expect, it } from 'vitest'
import { createAuthorityState, type AuthorityState } from '../authority/authorityState'
import type { DomainEvent } from '../authority/domainEvent'
import { playSlice } from '../bot/playSlice'
import { EMPTY_HINT_BOARD, observeHints, type HintStep } from './hintBoard'
import { HINT_TABLE } from './hintTable'

// #16 acceptance: the event sequence of the #2 acceptance run (the pacing bot from a fresh
// profile) fed into the hint rules, over the first ten minutes.

const WORLD_SEED = 83921
const TEN_MINUTES_TICKS = 10 * 60 * 60

interface ShownHint {
  id: string
  tick: number
  /** Whether an `energy_low` or `rescue_triggered` had happened by then. */
  isAfterEnergyWarning: boolean
}

/** Plays the bot's first ten minutes and lists every hint as it went up. */
function hintsOfFirstTenMinutes(seen: readonly string[] = []) {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: WORLD_SEED, playerIds: ['p1'] })
  let step: HintStep = { board: EMPTY_HINT_BOARD, seen }
  let hasEnergyWarning = false
  const shown: ShownHint[] = []
  const watch = (state: AuthorityState, events: readonly DomainEvent[]) => {
    hasEnergyWarning ||= events.some((event) =>
      ['EnergyLow', 'RescueTriggered'].includes(event.type),
    )
    const before = step.board.shown
    step = observeHints(step, { state, playerId: 'p1', events })
    const now = step.board.shown
    if (now !== null && now.id !== before?.id) {
      shown.push({ id: now.id, tick: now.shownTick, isAfterEnergyWarning: hasEnergyWarning })
    }
  }
  watch(start, [])
  playSlice(start, {
    playerId: 'p1',
    maxTicks: TEN_MINUTES_TICKS,
    listener: { onCommand: () => undefined, onEvents: watch },
  })
  return { shown, seen: step.seen }
}

describe('hints over the first ten minutes (#16 acceptance)', () => {
  const firstRun = hintsOfFirstTenMinutes()

  it('shows the move, drill, cargo and dock hints in that order', () => {
    const onboarding = firstRun.shown.filter((hint) => hint.id !== 'hint_energy')
    expect(onboarding.map((hint) => hint.id)).toEqual([
      'hint_move',
      'hint_drill',
      'hint_cargo',
      'hint_dock',
    ])
  })

  it('shows hint_energy only after an energy_low or a rescue', () => {
    const energy = firstRun.shown.filter((hint) => hint.id === 'hint_energy')
    expect(energy.every((hint) => hint.isAfterEnergyWarning)).toBe(true)
  })

  it('shows each hint once and at least 20 s after the one before', () => {
    const ids = firstRun.shown.map((hint) => hint.id)
    expect(new Set(ids).size).toBe(ids.length)
    const gaps = firstRun.shown
      .slice(1)
      .map((hint, index) => hint.tick - firstRun.shown[index].tick)
    expect(gaps.every((gap) => gap >= HINT_TABLE.minTicksBetweenHints)).toBe(true)
  })

  it('shows none again after a reload with the seen-set restored', () => {
    expect(hintsOfFirstTenMinutes(firstRun.seen).shown).toEqual([])
  })
})
