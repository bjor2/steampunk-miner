import { describe, expect, it } from 'vitest'
import { applyCommand } from '../applyCommand'
import type { AuthorityState } from '../authorityState'
import { withSystem } from '../planetOfState'
import { createScriptedSession } from '../scriptedSession'
import { readSnapshot, takeSnapshot, type SessionSnapshot } from '../sessionSnapshot'

/** As it would arrive from a save file or the debug API: JSON text, read back. */
const throughJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

function fuelledState(units: number): AuthorityState {
  const session = createScriptedSession()
  session.submit(0, { type: 'debug.setMoney', payload: { amount: '1e6' } })
  session.submit(5, { type: 'dock', payload: { bay: 'sell' } })
  session.submit(6, { type: 'buyFuel', payload: { units } })
  return session.state()
}

/** A snapshot with one field of the portable state rewritten, digest kept. */
function snapshotWith(edit: (snapshot: SessionSnapshot) => void): SessionSnapshot {
  const snapshot = throughJson(takeSnapshot(fuelledState(2)))
  edit(snapshot)
  return snapshot
}

describe('star map snapshot (ticket 755)', () => {
  it('restores a fuel tank exactly, through JSON', () => {
    const state = fuelledState(7)
    expect(readSnapshot(throughJson(takeSnapshot(state)))).toEqual({ state, problems: [] })
    expect(takeSnapshot(state).state.players.p1.vehicle.fuel).toBe('7e+0')
  })

  it('refuses a tank of part units or of none, with the problem listed', () => {
    for (const fuel of ['1.5', '0', '-1']) {
      const snapshot = snapshotWith((taken) => {
        taken.state.players.p1.vehicle.fuel = fuel
      })
      expect(readSnapshot(snapshot).problems).toEqual([
        'snapshot.state.players.p1.vehicle.fuel must be whole fuel units above 0 as a decimal string, or be left out',
      ])
    }
  })

  it('restores a planet of a later system, through JSON', () => {
    const start = createScriptedSession().state()
    const state = { ...start, planet: withSystem(start.planet, 2n) }
    expect(readSnapshot(throughJson(takeSnapshot(state)))).toEqual({ state, problems: [] })
    expect(takeSnapshot(state).state.planet.system).toBe('2')
  })

  it('writes no system for system 1, so a snapshot from before the star map reads the same', () => {
    const start = createScriptedSession().state()
    expect(withSystem(start.planet, 1n)).toEqual(start.planet)
    expect('system' in takeSnapshot(start).state.planet).toBe(false)
  })

  it('refuses a system written out as "1" or not as canonical index text', () => {
    for (const system of ['1', '02', 2]) {
      const snapshot = snapshotWith((taken) => {
        Object.assign(taken.state.planet, { system })
      })
      expect(readSnapshot(snapshot).problems).toEqual([
        'snapshot.state.planet.system must be a system index from "2", or be left out',
      ])
    }
  })

  it('has no world at a campaign index the later system does not hold (ticket 759)', () => {
    const start = createScriptedSession().state()
    const state = { ...start, planet: withSystem(start.planet, 2n) }
    const { events } = applyCommand(state, {
      playerId: 'p1',
      tick: 1,
      seq: 1,
      type: 'jumpToPlanet',
      payload: { system: '2', planet: '2' },
    })
    expect(events[0]).toMatchObject({ type: 'CommandRejected', reason: 'no_planet' })
  })
})
