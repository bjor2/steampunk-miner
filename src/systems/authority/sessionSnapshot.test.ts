import { describe, expect, it } from 'vitest'
import { FACING } from '../vehicle/vehiclePose'
import type { PlantedCharge } from '../vehicle/vehicleCharges'
import { applyCommand } from './applyCommand'
import { createAuthorityState, type AuthorityState } from './authorityState'
import { CASING_BREACHED, decodeCasing } from '../world/chunkDelta'
import { readSnapshot, takeSnapshot } from './sessionSnapshot'
import { stateDigest } from './stateDigest'
import { freezeEnemies, prepareCorridor, spawnEnemy } from './combat/combatFixtures'
import { createScriptedSession } from './scriptedSession'
import {
  BLAST_TICK,
  blastAt,
  liveBlastSession,
  R24_MM,
  SOLID_SITE,
} from './charges/liveBlastFixtures'
import { queueTerrainEdit } from './terrain/terrainEdits'

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
      snapshotVersion: 20,
      generatorVersion: 7,
      tick: 600,
      digest: stateDigest(richState()),
    })
    expect(snapshot.state.players.p1.wallet).toBe('1.000000000000000000000000000001e+40')
  })

  it('refuses a snapshot from another generator version instead of migrating it', () => {
    const snapshot = { ...takeSnapshot(richState()), generatorVersion: 1 }
    expect(readSnapshot(snapshot).problems).toEqual([
      'snapshot.generatorVersion is 1, this build reads 7',
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
      'snapshot.snapshotVersion is 0, this build reads 20',
      'snapshot.state.planet must hold a whole index and a safe-integer seed',
      'snapshot.state.players.p1 must hold a money wallet and a whole lastSeq',
      'snapshot.state.world must be an object',
      'snapshot.state.platform must hold a whole coreBay and a visual state',
      'snapshot.state.core must hold a reachedTick, whole harvestedTiles and isCompleted',
      'snapshot.state.combat must be an object',
      'snapshot.state.collapse must hold a list of blocks',
      'snapshot.state.lava must hold loose lava tiles and a next step tick or null',
      'snapshot.state.liveBlasts must be a list of live blasts',
      'snapshot.state.terrainEdits must be a list of terrain edits',
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
      'snapshot.snapshotVersion is 9, this build reads 20',
    ])
  })

  it('refuses casing runs that hold a value past the lining types', () => {
    const snapshot = throughJson(takeSnapshot(linedState()))
    const [key] = Object.keys(snapshot.state.world.chunks)
    const delta = snapshot.state.world.chunks[key]
    snapshot.state.world.chunks[key] = { ...delta, casing: [128 * 128, 240] }
    expect(readSnapshot(snapshot).problems).toEqual(['snapshot.state.world must hold chunk deltas'])
  })
})

describe('session snapshot: guns (#93)', () => {
  it('keeps the guns and their hits not yet logged mid-fight through save and load', () => {
    const session = createScriptedSession()
    const start = prepareCorridor(session, FACING.right)
    session.submit(start, { type: 'debug.setGunLevel', payload: { level: 20 } })
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

/** The state with a charge on the wall for player p1. */
function withPlanted(state: AuthorityState, planted: PlantedCharge): AuthorityState {
  const vehicle = state.players.p1.vehicle
  const charges = { ...vehicle.charges, planted }
  return { ...state, players: { p1: { ...state.players.p1, vehicle: { ...vehicle, charges } } } }
}

describe('session snapshot: blasting charges (#109)', () => {
  it('keeps the rack and a planted charge through save and load', () => {
    const start = createAuthorityState({ planetIndex: 1, planetSeed: 83921, playerIds: ['p1'] })
    const racked = applyCommand(start, {
      playerId: 'p1',
      tick: 600,
      seq: 1,
      type: 'debug.setCharges',
      payload: { size: 1, carried: 2, slotLevel: 1 },
    }).state
    const planted = withPlanted(racked, {
      tx: 3,
      ty: 280,
      size: 1,
      plantedTick: 600,
      detonateTick: 720,
    })
    expect(readSnapshot(throughJson(takeSnapshot(planted)))).toEqual({
      state: planted,
      problems: [],
    })
  })

  it('keeps a rack of two sizes and a remote charge with no fuse through save and load (#218)', () => {
    const start = createAuthorityState({ planetIndex: 25, planetSeed: 83921, playerIds: ['p1'] })
    const racked = applyCommand(start, {
      playerId: 'p1',
      tick: 600,
      seq: 1,
      type: 'debug.setCharges',
      payload: { size: 4, carried: 2, slotLevel: 5 },
    }).state
    const remote = { tx: 3, ty: 280, size: 7, plantedTick: 600, detonateTick: null }
    const planted = withPlanted(racked, remote)
    expect(readSnapshot(throughJson(takeSnapshot(planted)))).toEqual({
      state: planted,
      problems: [],
    })
  })

  it('refuses a rack holding a size off the ladder (#218)', () => {
    const snapshot = throughJson(takeSnapshot(richState()))
    const vehicle = snapshot.state.players.p1.vehicle
    const charges = { ...vehicle.charges, carriedBySize: { '11': 1 } }
    const broken = {
      ...snapshot,
      state: {
        ...snapshot.state,
        players: { p1: { ...snapshot.state.players.p1, vehicle: { ...vehicle, charges } } },
      },
    }
    expect(readSnapshot(broken).problems).toContain(
      'snapshot.state.players.p1.vehicle.charges must hold a rack flag, counts by size and a planted charge or null',
    )
  })

  it('refuses a snapshot whose vehicle has no charge rack', () => {
    const snapshot = throughJson(takeSnapshot(richState()))
    const { charges: _dropped, ...vehicle } = snapshot.state.players.p1.vehicle
    const broken = {
      ...snapshot,
      state: { ...snapshot.state, players: { p1: { ...snapshot.state.players.p1, vehicle } } },
    }
    expect(readSnapshot(broken).problems).toContain(
      'snapshot.state.players.p1.vehicle.charges must hold a rack flag, counts by size and a planted charge or null',
    )
  })
})

describe('session snapshot: live blasts and the terrain-edit queue (K6 #189)', () => {
  function midBlastState(): AuthorityState {
    const session = liveBlastSession([blastAt(SOLID_SITE, R24_MM)])
    session.advanceTo(BLAST_TICK + 5)
    return queueTerrainEdit(session.state(), {
      playerId: 'p1',
      source: 'probe.pocket',
      cells: [
        { kind: 'density', tx: 3, ty: 280, density: 0 },
        { kind: 'swap', tx: 4, ty: 280, cell: 2 },
      ],
    })
  }

  it('keeps a live blast mid-crater and the queued terrain edits through save and load', () => {
    const state = midBlastState()
    expect(state.liveBlasts[0].cursor).toBeGreaterThan(0)
    expect(readSnapshot(throughJson(takeSnapshot(state)))).toEqual({ state, problems: [] })
  })

  it('names a malformed live blast and a malformed terrain edit', () => {
    const snapshot = throughJson(takeSnapshot(midBlastState()))
    const broken = {
      ...snapshot,
      state: {
        ...snapshot.state,
        liveBlasts: [{ ...snapshot.state.liveBlasts[0], cursor: -1 }],
        terrainEdits: [{ ...snapshot.state.terrainEdits[0], cells: [{ kind: 'density' }] }],
      },
    }
    expect(readSnapshot(broken).problems).toEqual([
      'snapshot.state.liveBlasts[0] is malformed',
      'snapshot.state.terrainEdits[0] is malformed',
    ])
  })
})
