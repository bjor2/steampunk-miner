import { describe, expect, it } from 'vitest'
import { FACING } from '../vehicle/vehiclePose'
import { applyCommand } from './applyCommand'
import { createAuthorityState, type AuthorityState } from './authorityState'
import { CASING_BREACHED, decodeCasing } from '../world/chunkDelta'
import { readSnapshot, takeSnapshot } from './sessionSnapshot'
import { stateDigest } from './stateDigest'
import { freezeEnemies, prepareCorridor, spawnEnemy } from './combat/combatFixtures'
import { createScriptedSession } from './scriptedSession'

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
      snapshotVersion: 16,
      generatorVersion: 5,
      tick: 600,
      digest: stateDigest(richState()),
    })
    expect(snapshot.state.players.p1.wallet).toBe('1.000000000000000000000000000001e+40')
  })

  it('refuses a snapshot from another generator version instead of migrating it', () => {
    const snapshot = { ...takeSnapshot(richState()), generatorVersion: 1 }
    expect(readSnapshot(snapshot).problems).toEqual([
      'snapshot.generatorVersion is 1, this build reads 5',
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
      'snapshot.snapshotVersion is 0, this build reads 16',
      'snapshot.state.planet must hold a whole index and a safe-integer seed',
      'snapshot.state.players.p1 must hold a money wallet and a whole lastSeq',
      'snapshot.state.world must be an object',
      'snapshot.state.platform must hold a whole coreBay and a visual state',
      'snapshot.state.core must hold a reachedTick, whole harvestedTiles and isCompleted',
      'snapshot.state.combat must be an object',
      'snapshot.state.collapse must hold a list of blocks',
      'snapshot.state.lava must hold loose lava tiles and a next step tick or null',
      'snapshot.state.debugApplied must be a boolean',
    ])
  })
})

describe('session snapshot: casing (#41)', () => {
  function linedState(): AuthorityState {
    const start = createAuthorityState({ planetIndex: 1, planetSeed: 83921, playerIds: ['p1'] })
    const commands = [
      { type: 'debug.carveCircle', payload: { x: 500, y: 284000, radius: 950, amount: 255 } },
      { type: 'debug.lineCasing', payload: { x: 500, y: 284000, grade: 3 } },
      { type: 'debug.setCasingGrade', payload: { grade: 3 } },
    ] as const
    return commands.reduce(
      (state, intent, index) =>
        applyCommand(state, { playerId: 'p1', tick: 600, seq: index + 1, ...intent }).state,
      start,
    )
  }

  it('keeps the casing layer and the casing grade through save and load', () => {
    const state = linedState()
    expect(Object.values(state.world.chunks).some((delta) => delta.casing.length > 0)).toBe(true)
    expect(readSnapshot(throughJson(takeSnapshot(state)))).toEqual({ state, problems: [] })
  })

  it('keeps breached casing through save and load (#111)', () => {
    const gnawed = applyCommand(linedState(), {
      playerId: 'p1',
      tick: 600,
      seq: 4,
      type: 'debug.gnawCasing',
      payload: { x: 500, y: 284000 },
    }).state
    const deltas = Object.values(gnawed.world.chunks)
    expect(deltas.some((delta) => decodeCasing(delta).includes(CASING_BREACHED))).toBe(true)
    expect(readSnapshot(throughJson(takeSnapshot(gnawed)))).toEqual({ state: gnawed, problems: [] })
  })

  it('refuses a snapshot taken before breached casing, at version 9, with the version message', () => {
    const snapshot = { ...throughJson(takeSnapshot(linedState())), snapshotVersion: 9 }
    expect(readSnapshot(snapshot).problems).toEqual([
      'snapshot.snapshotVersion is 9, this build reads 16',
    ])
  })

  it('refuses casing runs that hold a grade above 15', () => {
    const snapshot = throughJson(takeSnapshot(linedState()))
    const [key] = Object.keys(snapshot.state.world.chunks)
    const delta = snapshot.state.world.chunks[key]
    snapshot.state.world.chunks[key] = { ...delta, casing: [128 * 128, 16] }
    expect(readSnapshot(snapshot).problems).toEqual(['snapshot.state.world must hold chunk deltas'])
  })
})

describe('session snapshot: guns (#93)', () => {
  it('keeps the guns and their hits not yet logged mid-fight through save and load', () => {
    const session = createScriptedSession()
    const start = prepareCorridor(session, FACING.right)
    session.submit(start, { type: 'debug.setGunLevel', payload: { level: 2 } })
    session.submit(start, freezeEnemies(true))
    session.submit(start, spawnEnemy('crawler', 1, -3))
    session.advanceTo(start + 5)
    const state = session.state()
    expect(state.combat.vehicles.p1.pendingGunHits).toHaveLength(1)
    expect(readSnapshot(throughJson(takeSnapshot(state)))).toEqual({ state, problems: [] })
  })

  it('refuses a vehicle whose guns are in an unknown mode', () => {
    const snapshot = throughJson(takeSnapshot(richState()))
    const vehicle = snapshot.state.players.p1.vehicle
    snapshot.state.players.p1.vehicle = { ...vehicle, gun: { level: 1, mode: 'burst' as 'off' } }
    expect(readSnapshot(snapshot).problems).toEqual([
      'snapshot.state.players.p1.vehicle.gun must hold a whole level and a gun mode',
    ])
  })
})

describe('session snapshot: blasting charges (#109)', () => {
  it('keeps the rack and a planted charge through save and load', () => {
    const start = createAuthorityState({ planetIndex: 1, planetSeed: 83921, playerIds: ['p1'] })
    const racked = applyCommand(start, {
      playerId: 'p1',
      tick: 600,
      seq: 1,
      type: 'debug.setCharges',
      payload: { carried: 2, slotLevel: 1 },
    }).state
    const vehicle = racked.players.p1.vehicle
    const planted = {
      ...racked,
      players: {
        p1: {
          ...racked.players.p1,
          vehicle: {
            ...vehicle,
            charges: { ...vehicle.charges, planted: { tx: 3, ty: 280, detonateTick: 720 } },
          },
        },
      },
    }
    expect(readSnapshot(throughJson(takeSnapshot(planted)))).toEqual({
      state: planted,
      problems: [],
    })
  })

  it('refuses a snapshot whose vehicle has no charge rack', () => {
    const snapshot = throughJson(takeSnapshot(richState()))
    const { charges: _dropped, ...vehicle } = snapshot.state.players.p1.vehicle
    const broken = {
      ...snapshot,
      state: { ...snapshot.state, players: { p1: { ...snapshot.state.players.p1, vehicle } } },
    }
    expect(readSnapshot(broken).problems).toContain(
      'snapshot.state.players.p1.vehicle.charges must hold a rack flag, whole counts and a planted charge or null',
    )
  })
})
