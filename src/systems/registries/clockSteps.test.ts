import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { add, fromSafeInteger, toCanonical } from '../money'
import { createScriptedSession } from '../authority/scriptedSession'
import { stateDigest } from '../authority/stateDigest'
import type { DomainEvent } from '../authority/domainEvent'

// A slice's clock step resolves on the authority clock with no command (#217); a fake slice
// registers one through withRegistrations, so no real slice is imported.

const DUE_TICK = 50
const END_TICK = 200

/** Pays p1 one coin at tick 50 and says so; the world is quiet, so only the step stops the clock. */
const PAY_AT_FIFTY: SliceDefinition = {
  id: 'clock-probe',
  register: (r) =>
    r.clockStep({
      id: 'clock-probe.payday',
      nextTick: (state) => (state.tick < DUE_TICK ? DUE_TICK : null),
      run: (state, tick) => {
        if (tick !== DUE_TICK) return { state, events: [] }
        const player = state.players.p1
        const wallet = add(player.wallet, fromSafeInteger(1))
        return {
          state: { ...state, players: { ...state.players, p1: { ...player, wallet } } },
          events: [{ type: 'StorageFull', lostUnits: 1 }],
        }
      },
    }),
}

/** Runs the clock to the end in `stepTicks` strides with only `slices` registered. */
function clockRunWith(slices: readonly SliceDefinition[], stepTicks: number) {
  return withRegistrations(slices, () => {
    const session = createScriptedSession()
    const events: DomainEvent[] = []
    for (let tick = stepTicks; tick <= END_TICK; tick += stepTicks) {
      events.push(...session.advanceTo(tick))
    }
    return { events, state: session.state(), digest: stateDigest(session.state()) }
  })
}

const isProbeEvent = (event: DomainEvent) => event.type === 'StorageFull'

describe('slice clock steps', () => {
  it('runs a registered step at the tick it named, its event stamped with that tick', () => {
    const { events, state } = clockRunWith([PAY_AT_FIFTY], END_TICK)
    expect(events.filter(isProbeEvent)).toEqual([
      { tick: DUE_TICK, type: 'StorageFull', lostUnits: 1 },
    ])
    expect(toCanonical(state.players.p1.wallet)).toBe('1e+0')
  })

  it('gives the same events and state jumping or stepping one tick or eight at a time', () => {
    const jumped = clockRunWith([PAY_AT_FIFTY], END_TICK)
    expect(clockRunWith([PAY_AT_FIFTY], 1)).toEqual(jumped)
    expect(clockRunWith([PAY_AT_FIFTY], 8)).toEqual(jumped)
  })

  it('leaves the clock as it was with no step registered', () => {
    const plain = clockRunWith([], END_TICK)
    expect(plain.events.filter(isProbeEvent)).toEqual([])
    expect(plain.state.tick).toBe(END_TICK)
  })

  it('moves a quiet clock on when a step names a tick already reached', () => {
    const late: SliceDefinition = {
      id: 'clock-probe',
      register: (r) =>
        r.clockStep({
          id: 'clock-probe.late',
          nextTick: () => 0,
          run: (state) => ({ state, events: [] }),
        }),
    }
    expect(clockRunWith([late], END_TICK).state.tick).toBe(END_TICK)
  })
})
