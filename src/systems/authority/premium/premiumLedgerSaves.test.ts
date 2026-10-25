import { describe, expect, it } from 'vitest'
import { vehicleOf, withVehicle, type AuthorityState } from '../authorityState'
import { continueScriptedSession, createScriptedSession } from '../scriptedSession'
import { readSnapshot, takeSnapshot } from '../sessionSnapshot'

// The premium ledger in a save (ticket 844): an optional key, left out while empty, read against
// the hold it counts; a restore refuses a broken ledger, never trims it.

const throughJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

function ledgeredState(): AuthorityState {
  const start = createScriptedSession().state()
  const vehicle = vehicleOf(start, 'p1')
  const session = continueScriptedSession(
    withVehicle(start, 'p1', { ...vehicle, cargo: { ...vehicle.cargo, ore: { 2: 5n, 3: 1n } } }),
  )
  const counts = { '2:1:1:test-amber': '3', '2:1:2:test-lens': '2', '3:1:1:test-amber': '1' }
  session.submit(1, { type: 'debug.setPremiumLedger', payload: { counts } })
  return session.state()
}

describe('premium ledger saves', () => {
  it('saves and restores the counts with the state digest as taken', () => {
    const state = ledgeredState()
    const restored = readSnapshot(throughJson(takeSnapshot(state)))
    if (!('state' in restored)) throw new Error(restored.problems.join('; '))
    expect(restored.state).toEqual(state)
  })

  it('leaves the key out of a save with no premium unit', () => {
    const snapshot = takeSnapshot(createScriptedSession().state())
    expect('premiumLedger' in snapshot.state.players.p1).toBe(false)
  })

  it('refuses a saved ledger counting more units than its hold, or out of key order', () => {
    const snapshot = throughJson(takeSnapshot(ledgeredState()))
    const player = snapshot.state.players.p1
    const over = {
      ...player,
      vehicle: { ...player.vehicle, cargo: { ore: { 2: 4, 3: 1 }, coreFragments: 0 } },
    }
    const reordered = { ...player, premiumLedger: [...(player.premiumLedger ?? [])].reverse() }
    const problemsOf = (p1: unknown) =>
      readSnapshot({ ...snapshot, state: { ...snapshot.state, players: { p1 } } }).problems
    expect(problemsOf(over)).toContain(
      'snapshot.state.players.p1.premiumLedger: tier 2 counts more premium units than the hold holds',
    )
    expect(problemsOf(reordered)).toEqual([
      'snapshot.state.players.p1.premiumLedger must hold one count per key, in key order',
    ])
  })
})
