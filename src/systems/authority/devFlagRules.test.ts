import { describe, expect, it } from 'vitest'
import { AUTHORITY_DEV_FLAGS } from '../../constants/devFlags'
import { readSaveSlot, saveSlotOf } from '../save/saveSlot'
import { FACING } from '../vehicle/vehiclePose'
import { vehicleOf, withVehicle } from './authorityState'
import type { DomainEvent } from './domainEvent'
import { AUTHORITY_FLAG_IDS, flagsOf } from './devFlagState'
import {
  continueScriptedSession,
  createScriptedSession,
  FREEZE_ENEMIES,
  GROUND,
  poseAbove,
  typesOf,
  type ScriptedSession,
} from './scriptedSession'
import { readSnapshot, takeSnapshot } from './sessionSnapshot'
import { stateDigest } from './stateDigest'

// The authority's dev flags as logged state (ticket 547, the TD ruling on #547 and its
// amendment): `debug.setFlags` is the one writer, the session keeps only the flags off their
// shipped defaults and a sticky taint, a flag turned on drops its carries, and a shared session's
// flags are its host's.

const setFlags = (delta: Record<string, unknown>) =>
  ({ type: 'debug.setFlags', payload: { delta } }) as const

const DRILL_POWER = {
  type: 'debug.setUpgrade',
  payload: { upgradeId: 'drill_power', level: 10 },
} as const

/** A vehicle that drilled one-tick reports over the ground, so both report carries stand. */
function drilledWithCarries(): ScriptedSession {
  const session = createScriptedSession()
  session.submit(0, FREEZE_ENEMIES)
  session.submit(0, DRILL_POWER)
  session.submit(0, poseAbove(GROUND, FACING.down))
  for (let tick = 1; tick <= 7; tick++) {
    session.submit(tick, poseAbove(GROUND, FACING.down, { drillTicks: 1 }))
  }
  return session
}

const carriesOf = (session: ScriptedSession) => {
  const { cutEnergyCarry, cutHeatCarry, sweptCut } = session.vehicle()
  return { cutEnergyCarry, cutHeatCarry, sweptCarry: sweptCut?.carrySubSteps }
}

function rejectionOf(events: readonly DomainEvent[]) {
  const rejected = events.find((event) => event.type === 'CommandRejected')
  return rejected?.type === 'CommandRejected' ? rejected : undefined
}

describe('a session nobody flipped (ticket 547)', () => {
  it('carries no flag field in its state, snapshot or save, and reads the shipped flags', () => {
    const state = createScriptedSession().state()
    expect('devFlagDelta' in state).toBe(false)
    expect('devFlagsEverSet' in state).toBe(false)
    expect(flagsOf(state)).toBe(AUTHORITY_DEV_FLAGS)
    const snapshot = takeSnapshot(state)
    expect(Object.keys(snapshot.state)).not.toContain('devFlagDelta')
    expect(Object.keys(snapshot.state)).not.toContain('devFlagsEverSet')
    const save = saveSlotOf(snapshot, 1)
    expect(Object.keys(save.world)).not.toContain('devFlagDelta')
    expect(Object.keys(save.world)).not.toContain('devFlagsEverSet')
  })
})

describe('debug.setFlags (ticket 547)', () => {
  it('sets the named flags, keeps the rest, and keeps only the ones off their defaults', () => {
    const session = createScriptedSession()
    const events = session.submit(5, setFlags({ 'drill.exactCarry': false }))
    const state = session.state()
    expect(flagsOf(state)).toEqual({ ...AUTHORITY_DEV_FLAGS, 'drill.exactCarry': false })
    expect(state.devFlagDelta).toEqual({ 'drill.exactCarry': false })
    expect(state.devFlagsEverSet).toBe(true)
    expect(typesOf(events)).toEqual(['DevFlagsSet', 'DebugCommandApplied'])
    expect(events[0]).toMatchObject({ tick: 5, delta: { 'drill.exactCarry': false } })
  })

  it('keeps no delta for a flag set to its shipped default, but marks the session', () => {
    const session = createScriptedSession()
    session.submit(0, setFlags({ 'enemy.lureRetarget': true }))
    expect('devFlagDelta' in session.state()).toBe(false)
    expect(session.state().devFlagsEverSet).toBe(true)
  })

  it('keeps the taint when a flip back leaves the delta empty', () => {
    const session = createScriptedSession()
    session.submit(3, setFlags({ 'heat.workUncapped': false, 'codex.materialContact': false }))
    session.submit(9, setFlags({ 'heat.workUncapped': true }))
    expect(session.state().devFlagDelta).toEqual({ 'codex.materialContact': false })
    session.submit(12, setFlags({ 'codex.materialContact': true }))
    expect('devFlagDelta' in session.state()).toBe(false)
    expect(session.state().devFlagsEverSet).toBe(true)
    expect(flagsOf(session.state())).toEqual(AUTHORITY_DEV_FLAGS)
  })

  it('digests a set then reset like two settings that changed nothing at the same ticks', () => {
    const flipped = createScriptedSession()
    flipped.submit(4, setFlags({ 'drill.reportCapsule': false }))
    flipped.submit(8, setFlags({ 'drill.reportCapsule': true }))
    const untouched = createScriptedSession()
    untouched.submit(4, setFlags({}))
    untouched.submit(8, setFlags({}))
    expect(stateDigest(flipped.state())).toBe(stateDigest(untouched.state()))
  })

  it('refuses an id the authority has no flag for, the client loop flags included', () => {
    const session = createScriptedSession()
    const before = session.state()
    const events = session.submit(0, setFlags({ 'drill.sweptCut': false, 'no.such': true }))
    expect(rejectionOf(events)).toMatchObject({ reason: 'unknown_flag' })
    expect(rejectionOf(events)?.problems).toHaveLength(2)
    expect(session.state()).toBe(before)
  })

  it('refuses a flag set to anything but a boolean: flags, never numbers', () => {
    const events = createScriptedSession().submit(0, setFlags({ 'drill.exactCarry': 1.12 }))
    expect(rejectionOf(events)).toMatchObject({ reason: 'invalid_payload' })
  })
})

describe("a shared session's dev flags (ticket 547, VS 2)", () => {
  it('refuses a player who is not the host, with the reason logged, and changes nothing', () => {
    const session = createScriptedSession(['p1', 'p2'])
    const before = session.state()
    const events = session.submit(2, setFlags({ 'enemy.lureRetarget': false }), 'p2')
    expect(typesOf(events)).toEqual(['CommandRejected'])
    expect(rejectionOf(events)).toMatchObject({ reason: 'not_session_host', playerId: 'p2' })
    expect(session.state()).toBe(before)
  })

  it("accepts and logs the host's", () => {
    const session = createScriptedSession(['p2', 'p1'])
    const events = session.submit(2, setFlags({ 'enemy.lureRetarget': false }), 'p1')
    expect(typesOf(events)).toEqual(['DevFlagsSet', 'DebugCommandApplied'])
    expect(flagsOf(session.state())['enemy.lureRetarget']).toBe(false)
  })
})

describe('a flag turned on drops its carries (ticket 547, the amendment decision 1)', () => {
  it('leaves the report carries standing when the exact carry goes off', () => {
    const session = drilledWithCarries()
    const carried = carriesOf(session)
    expect(carried.cutEnergyCarry ?? 0).toBeGreaterThan(0)
    expect(carried.cutHeatCarry ?? 0).toBeGreaterThan(0)
    session.submit(8, setFlags({ 'drill.exactCarry': false }))
    expect(carriesOf(session)).toEqual(carried)
  })

  it('drops both report carries when the exact carry comes back on, so none is consumed', () => {
    const session = drilledWithCarries()
    session.submit(8, setFlags({ 'drill.exactCarry': false }))
    session.submit(9, setFlags({ 'drill.exactCarry': true }))
    expect(carriesOf(session)).toEqual({
      cutEnergyCarry: undefined,
      cutHeatCarry: undefined,
      sweptCarry: undefined,
    })
  })

  it('drops the heat carry alone when uncapped heat comes back on', () => {
    const session = drilledWithCarries()
    const { cutEnergyCarry } = carriesOf(session)
    session.submit(8, setFlags({ 'heat.workUncapped': false }))
    session.submit(9, setFlags({ 'heat.workUncapped': true }))
    expect(carriesOf(session)).toEqual({
      cutEnergyCarry,
      cutHeatCarry: undefined,
      sweptCarry: undefined,
    })
  })

  it("drops the energy carry and the swept cursor's carried work when the swept law charge comes back on", () => {
    const drilled = drilledWithCarries()
    const vehicle = vehicleOf(drilled.state(), 'p1')
    const sweptCut = {
      ...{ xMm: 0, yMm: 0, poseXMm: 0, poseYMm: 0, facing: FACING.down, tick: 7 },
      ...{ cutGate: 0, cutGateLowTicks: 0, cutSharePassed: 0, digSubSteps: 0, carrySubSteps: 37 },
    } as const
    const session = continueScriptedSession(
      withVehicle(drilled.state(), 'p1', { ...vehicle, sweptCut }),
    )
    const { cutHeatCarry } = carriesOf(session)
    session.submit(8, setFlags({ 'drill.sweptLawCharge': false }))
    expect(carriesOf(session).sweptCarry).toBe(37)
    session.submit(9, setFlags({ 'drill.sweptLawCharge': true }))
    expect(carriesOf(session)).toEqual({ cutEnergyCarry: undefined, cutHeatCarry, sweptCarry: 0 })
  })

  it('drops no carry for a flag that reads none', () => {
    const session = drilledWithCarries()
    const carried = carriesOf(session)
    session.submit(8, setFlags({ 'enemy.lureRetarget': false, 'codex.materialContact': false }))
    session.submit(9, setFlags({ 'enemy.lureRetarget': true, 'codex.materialContact': true }))
    expect(carriesOf(session)).toEqual(carried)
  })
})

describe('the flags across a snapshot and a save (ticket 547)', () => {
  it('restores a snapshot taken after a flip to the same digest and the same flags', () => {
    const session = drilledWithCarries()
    session.submit(8, setFlags({ 'drill.exactCarry': false, 'enemy.lureRetarget': false }))
    const restored = readSnapshot(JSON.parse(JSON.stringify(takeSnapshot(session.state()))))
    if (!('state' in restored)) throw new Error(restored.problems.join('; '))
    expect(stateDigest(restored.state)).toBe(stateDigest(session.state()))
    expect(flagsOf(restored.state)).toEqual(flagsOf(session.state()))
    expect(restored.state.devFlagsEverSet).toBe(true)
  })

  it('saves a flipped world with its delta and loads it running as it ran', () => {
    const session = createScriptedSession()
    session.submit(3, setFlags({ 'heat.workUncapped': false }))
    const file = JSON.parse(JSON.stringify(saveSlotOf(takeSnapshot(session.state()), 1)))
    expect(file.world.devFlagDelta).toEqual({ 'heat.workUncapped': false })
    expect(file.world.devFlagsEverSet).toBe(true)
    const loaded = readSaveSlot(file)
    if (!('state' in loaded)) throw new Error(loaded.problems.join('; '))
    expect(flagsOf(loaded.state)['heat.workUncapped']).toBe(false)
    expect(stateDigest(loaded.state)).toBe(stateDigest(session.state()))
  })

  it('refuses a snapshot whose delta names a flag this build does not have', () => {
    const session = createScriptedSession()
    session.submit(3, setFlags({ 'heat.workUncapped': false }))
    const snapshot = JSON.parse(JSON.stringify(takeSnapshot(session.state())))
    snapshot.state.devFlagDelta = { 'heat.gone': false }
    const restored = readSnapshot(snapshot)
    expect(restored.problems).toContain(
      'snapshot.state.devFlagDelta names "heat.gone", not an authority dev flag',
    )
  })
})

describe('a flip grants nothing (ticket 547, HS a and c)', () => {
  it.each(AUTHORITY_FLAG_IDS)(
    'writes no unlock, ore first, artefact, codex or item record when %s flips',
    (id) => {
      const session = drilledWithCarries()
      const before = session.state()
      const off = session.submit(8, setFlags({ [id]: false }))
      const on = session.submit(9, setFlags({ [id]: true }))
      expect(typesOf([...off, ...on])).toEqual([
        'DevFlagsSet',
        'DebugCommandApplied',
        'DevFlagsSet',
        'DebugCommandApplied',
      ])
      const after = session.state()
      expect(after.slices).toEqual(before.slices)
      expect(after.players.p1.slices).toEqual(before.players.p1.slices)
      expect(after.players.p1.artefact).toEqual(before.players.p1.artefact)
      expect(after.players.p1.vehicle.loadout).toEqual(before.players.p1.vehicle.loadout)
      expect(after.world).toBe(before.world)
    },
  )
})
