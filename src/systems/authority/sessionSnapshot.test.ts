import { describe, expect, it } from 'vitest'
import { applyCommand } from './applyCommand'
import { createAuthorityState, type AuthorityState } from './authorityState'
import { readSnapshot, takeSnapshot } from './sessionSnapshot'
import { stateDigest } from './stateDigest'

function richState(): AuthorityState {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: 83921, playerIds: ['p1'] })
  return applyCommand(start, {
    playerId: 'p1',
    tick: 600,
    seq: 1,
    type: 'debug.grantMoney',
    payload: { amount: '1.000000000000000000000000000001e+40' },
  }).state
}

/** As it would arrive from a save file or the debug API: JSON text, read back. */
const throughJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

describe('session snapshot', () => {
  it('restores the exact state it was taken from, through JSON', () => {
    const state = richState()
    const restored = readSnapshot(throughJson(takeSnapshot(state)))
    expect(restored).toEqual({ state, problems: [] })
  })

  it('carries the state digest and the versions it was taken under', () => {
    const snapshot = takeSnapshot(richState())
    expect(snapshot).toMatchObject({
      snapshotVersion: 2,
      generatorVersion: 1,
      tick: 600,
      digest: stateDigest(richState()),
    })
    expect(snapshot.state.players.p1.wallet).toBe('1.000000000000000000000000000001e+40')
  })

  it('refuses a snapshot from another generator version instead of migrating it', () => {
    const snapshot = { ...takeSnapshot(richState()), generatorVersion: 2 }
    expect(readSnapshot(snapshot).problems).toEqual([
      'snapshot.generatorVersion is 2, this build reads 1',
    ])
  })

  it('refuses a state that does not match its digest', () => {
    const snapshot = throughJson(takeSnapshot(richState()))
    snapshot.state.players.p1.wallet = '2e+40'
    expect(readSnapshot(snapshot).problems).toEqual(['snapshot digest does not match its state'])
  })

  it('lists every malformed part', () => {
    const snapshot = throughJson(takeSnapshot(richState())) as unknown as Record<string, unknown>
    const broken = {
      ...snapshot,
      snapshotVersion: 0,
      state: { tick: 600, planet: { index: -1, seed: 1 }, players: { p1: { wallet: 5 } } },
    }
    expect(readSnapshot(broken).problems).toEqual([
      'snapshot.snapshotVersion is 0, this build reads 2',
      'snapshot.state.planet must hold a whole index and a safe-integer seed',
      'snapshot.state.players.p1 must hold a money wallet and a whole lastSeq',
      'snapshot.state.world must be an object',
      'snapshot.state.debugApplied must be a boolean',
    ])
  })
})
