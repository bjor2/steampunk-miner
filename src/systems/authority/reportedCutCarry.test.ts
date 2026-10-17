import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AUTHORITY_DEV_FLAGS, type AuthorityDevFlags } from '../../constants/devFlags'
import { ENERGY_QUANTA_PER_TICK } from '../vehicle/energyQuanta'
import {
  CUT_ENERGY_DENOMINATOR,
  LAW_WORK_PER_DRILL_TICK,
  splitCutHeatCarry,
} from '../vehicle/cutCarry'
import { NO_DRIVE } from '../vehicle/driveSigns'
import { FACING } from '../vehicle/vehiclePose'
import { vehicleOf, withVehicle, type AuthorityState } from './authorityState'
import {
  brokenCellsOf,
  cutEnergyNumeratorOf,
  energyNumeratorOfLawWork,
  lawWorkRemovedOf,
  tilesAround,
} from './cutCarryFixtures'
import type { DomainEvent } from './domainEvent'
import { followHeat } from './heatRules'
import { drillReportedTicks, followReportedHeat } from './reportedDrill'
import {
  createScriptedSession,
  FREEZE_ENEMIES,
  GROUND,
  poseAbove,
  type ScriptedSession,
} from './scriptedSession'
import { readSnapshot, takeSnapshot } from './sessionSnapshot'
import { stateDigest } from './stateDigest'

// The report cut's charge on density removed with an integer carry (ticket 535, A6 "Option L", the
// TD shape 6228682000 as VS 6228848270 and the GD ruled it): with the charge on or off the carve
// is byte-identical, and only energy, heat and the carries move. Cumulative charge equals the law
// work removed at the swept price plus the carry; many one-tick reports pay and heat exactly as
// one long report; a tank that cannot pay keeps the debt; the carries round-trip the snapshot and
// are dropped at planet entry and by the tow.

const EXACT_OFF: AuthorityDevFlags = { ...AUTHORITY_DEV_FLAGS, 'drill.exactCarry': false }
const EXACT_ON: AuthorityDevFlags = { ...AUTHORITY_DEV_FLAGS, 'drill.exactCarry': true }

// The switch ships off until #541 lands (`constants/devFlags.ts`): every scripted session here
// runs with it on, put back after, and the on-versus-off gate passes its flags explicitly.
const switchable = AUTHORITY_DEV_FLAGS as { -readonly [K in keyof AuthorityDevFlags]: boolean }
const SHIPPED_SWITCH = switchable['drill.exactCarry']
beforeAll(() => {
  switchable['drill.exactCarry'] = true
})
afterAll(() => {
  switchable['drill.exactCarry'] = SHIPPED_SWITCH
})

/** Planet 8, the first heat planet, and band-5 rock straight above its core (`heatRun.test.ts`). */
const HEAT_PLANET = 8
const BAND_5 = { x: 500, y: 40500 }
const WATCH_REACH = 4

/** Drill power 10 breaks a band-1 cell in 2,143 sub-steps, not a whole number of ticks. */
const DRILL_POWER = {
  type: 'debug.setUpgrade',
  payload: { upgradeId: 'drill_power', level: 10 },
} as const

/** A vehicle over the ground east of the dock, enemies frozen, the tank full. */
function overGround(): ScriptedSession {
  const session = createScriptedSession()
  session.submit(0, FREEZE_ENEMIES)
  session.submit(0, DRILL_POWER)
  session.submit(0, poseAbove(GROUND, FACING.down))
  return session
}

/** `reports` drilling reports over the ground of `ticks` each, from tick 0; their events. */
function reportDrilling(session: ScriptedSession, reports: number, ticks: number): DomainEvent[] {
  const events: DomainEvent[] = []
  for (let report = 1; report <= reports; report++) {
    events.push(
      ...session.submit(report * ticks, poseAbove(GROUND, FACING.down, { drillTicks: ticks })),
    )
  }
  return events
}

/** The same drilling with the switch as `flags` has it, through the rule the report calls. */
function cutWith(flags: AuthorityDevFlags, ticks: number) {
  const session = overGround()
  const state = session.state()
  const vehicle = vehicleOf(state, 'p1')
  const { payload } = poseAbove(GROUND, FACING.down, { drillTicks: ticks })
  return drillReportedTicks({ ...state, tick: ticks }, 'p1', vehicle, payload, flags)
}

/** A report at `at` facing down on the heat planet, drilling for `drillTicks`. */
function heatPlanetReport(at: { x: number; y: number }, drillTicks: number) {
  return {
    type: 'reportPose' as const,
    payload: {
      ...poseAbove(GROUND, FACING.down, { drillTicks }).payload,
      x: at.x,
      y: at.y,
      drive: NO_DRIVE,
    },
  }
}

/** The vehicle on planet 8 at band 5, with the on-curve drill so band 5 is cut. */
function onHeatPlanet(): ScriptedSession {
  const session = createScriptedSession()
  session.submit(0, { type: 'debug.setPlanet', payload: { planetIndex: HEAT_PLANET } })
  session.submit(0, FREEZE_ENEMIES)
  session.submit(0, heatPlanetReport(BAND_5, 0))
  return session
}

/** Each chunk's densities and casing, without the count of edits that made them. */
function groundOf(state: AuthorityState) {
  return Object.entries(state.world.chunks).map(([key, chunk]) => [key, { ...chunk, version: 0 }])
}

function withHeatCarry(state: AuthorityState, cutHeatCarry: number): AuthorityState {
  return withVehicle(state, 'p1', { ...vehicleOf(state, 'p1'), cutHeatCarry })
}

const carriesOf = (state: AuthorityState) => {
  const { cutEnergyCarry, cutHeatCarry } = vehicleOf(state, 'p1')
  return { cutEnergyCarry, cutHeatCarry }
}

describe('the report cut with the charge on and off (ticket 535, the regression gate)', () => {
  it('cuts the same bytes, breaks the same cells in the same order and reports the same ticks', () => {
    const on = cutWith(EXACT_ON, 60)
    const off = cutWith(EXACT_OFF, 60)
    expect(brokenCellsOf(on.events).length).toBeGreaterThan(0)
    expect(groundOf(on.state)).toEqual(groundOf(off.state))
    expect(brokenCellsOf(on.events)).toEqual(brokenCellsOf(off.events))
    expect(on.events).toEqual(off.events)
  })

  it('moves only the energy and the carries between on and off', () => {
    const on = vehicleOf(cutWith(EXACT_ON, 60).state, 'p1')
    const off = vehicleOf(cutWith(EXACT_OFF, 60).state, 'p1')
    const {
      energy: _onEnergy,
      cutEnergyCarry: _energyCarry,
      cutHeatCarry: _heatCarry,
      ...onRest
    } = on
    const { energy: _offEnergy, ...offRest } = off
    expect(onRest).toEqual(offRest)
    expect(off.cutEnergyCarry).toBeUndefined()
    expect(off.cutHeatCarry).toBeUndefined()
    expect(on.energy).not.toBe(off.energy)
  })

  it('charges the ticks the stamp removed something in, as protocol 84 did, with the switch off', () => {
    const session = overGround()
    const vehicle = session.vehicle()
    const off = cutWith(EXACT_OFF, 60)
    const damage = off.events.find((event) => event.type === 'DrillDamageDealt')
    const ticksUsed = damage?.type === 'DrillDamageDealt' ? damage.ticks : 0
    expect(ticksUsed).toBeGreaterThan(0)
    expect(vehicle.energy - vehicleOf(off.state, 'p1').energy).toBe(
      ticksUsed * ENERGY_QUANTA_PER_TICK.drill,
    )
  })
})

describe('the report cut charges the law work it removed (ticket 535)', () => {
  it('keeps charged quanta times the denominator plus the carry equal to the law work removed', () => {
    const session = overGround()
    const before = session.state()
    reportDrilling(session, 7, 12)
    const lawWork = lawWorkRemovedOf(
      before,
      session.state().world,
      tilesAround(GROUND, WATCH_REACH),
    )
    expect(lawWork).toBeGreaterThan(0)
    expect(cutEnergyNumeratorOf(before.players.p1.vehicle, session.vehicle())).toBe(
      energyNumeratorOfLawWork(lawWork),
    )
    expect(session.vehicle().cutEnergyCarry ?? 0).toBeLessThan(CUT_ENERGY_DENOMINATOR)
  })

  it('pays and heats many one-tick reports exactly as one report of their ticks', () => {
    const long = overGround()
    const broken = brokenCellsOf(reportDrilling(long, 1, 60))
    const short = overGround()
    const shortBroken = brokenCellsOf(reportDrilling(short, 60, 1))
    expect(broken.length).toBeGreaterThan(0)
    expect(shortBroken).toEqual(broken)
    expect(groundOf(short.state())).toEqual(groundOf(long.state()))
    expect(short.vehicle().energy).toBe(long.vehicle().energy)
    expect(carriesOf(short.state())).toEqual(carriesOf(long.state()))
  })

  it('cuts and charges the same ground at a report every 1, 6 and 12 ticks', () => {
    const after = (interval: number) => {
      const session = overGround()
      reportDrilling(session, 120 / interval, interval)
      return session.state()
    }
    const [everyTick, ...coarser] = [1, 6, 12].map(after)
    for (const state of coarser) {
      expect(groundOf(state)).toEqual(groundOf(everyTick))
      expect(state.players.p1.vehicle.energy).toBe(everyTick.players.p1.vehicle.energy)
      expect(carriesOf(state)).toEqual(carriesOf(everyTick))
    }
  })

  it('pays no more than the tank holds and carries the debt, which strands the rig till the tow', () => {
    const session = overGround()
    session.submit(0, { type: 'debug.setEnergy', payload: { energy: '0.1' } })
    const before = session.state()
    const tank = before.players.p1.vehicle.energy
    reportDrilling(session, 1, 24)
    const lawWork = lawWorkRemovedOf(
      before,
      session.state().world,
      tilesAround(GROUND, WATCH_REACH),
    )
    const owed = energyNumeratorOfLawWork(lawWork)
    expect(owed).toBeGreaterThan(tank * CUT_ENERGY_DENOMINATOR)
    expect(session.vehicle().energy).toBe(0)
    expect(session.vehicle().cutEnergyCarry).toBe(owed - tank * CUT_ENERGY_DENOMINATOR)
    expect(session.vehicle().mode).toBe('stranded')
    session.submit(25, { type: 'requestRescue', payload: {} })
    expect(session.vehicle().mode).toBe('docked')
    expect(carriesOf(session.state())).toEqual({})
  })

  it('charges nothing and carries nothing for a reported drill into open ground', () => {
    const session = overGround()
    reportDrilling(session, 5, 60)
    const cleared = session.vehicle()
    session.submit(301, { type: 'debug.setEnergy', payload: { energy: '150' } })
    const before = session.vehicle()
    reportDrilling(session, 1, 60)
    expect(cleared.cutEnergyCarry).toBe(before.cutEnergyCarry)
    expect(session.vehicle().energy).toBe(before.energy)
    expect(carriesOf(session.state())).toEqual({
      cutEnergyCarry: before.cutEnergyCarry,
      cutHeatCarry: before.cutHeatCarry,
    })
  })
})

describe('the report cut heats from the law work it removed (ticket 535)', () => {
  it('keeps the heat carry under one drill tick between reports, the rest having heated', () => {
    const session = overGround()
    const before = session.state()
    reportDrilling(session, 1, 60)
    const lawWork = lawWorkRemovedOf(
      before,
      session.state().world,
      tilesAround(GROUND, WATCH_REACH),
    )
    expect(lawWork).toBeGreaterThan(LAW_WORK_PER_DRILL_TICK)
    expect(session.vehicle().cutHeatCarry).toBe(lawWork % LAW_WORK_PER_DRILL_TICK)
  })

  it("heats the carry's whole drill ticks and keeps the rest, read after the report's cut", () => {
    const session = onHeatPlanet()
    const before = session.vehicle()
    const command = { playerId: 'p1', tick: 12, seq: 9, ...heatPlanetReport(BAND_5, 12) }
    const cut = withHeatCarry(session.state(), LAW_WORK_PER_DRILL_TICK * 2 + 30)
    const heated = followReportedHeat(cut, command, before, EXACT_ON)
    const expected = followHeat(withHeatCarry(session.state(), 30), 'p1', 12, {
      drillTicks: 2,
      isIdle: false,
    })
    expect(heated.state).toEqual(expected.state)
    expect(vehicleOf(heated.state, 'p1').cutHeatCarry).toBe(30)
    expect(splitCutHeatCarry(vehicleOf(cut, 'p1')).heatTicks).toBe(2)
  })

  it('heats for the reported drill ticks and leaves any carry be with the switch off', () => {
    const session = onHeatPlanet()
    const before = session.vehicle()
    const command = { playerId: 'p1', tick: 12, seq: 9, ...heatPlanetReport(BAND_5, 12) }
    const cut = withHeatCarry(session.state(), 150)
    const heated = followReportedHeat(cut, command, before, EXACT_OFF)
    const expected = followHeat(cut, 'p1', 12, { drillTicks: 12, isIdle: false })
    expect(heated.state).toEqual(expected.state)
  })

  it('heats a report whose drill removes nothing as a vehicle that does not drill', () => {
    const drilling = onHeatPlanet()
    drilling.submit(120, heatPlanetReport(BAND_5, 120))
    const driving = onHeatPlanet()
    driving.submit(120, {
      ...heatPlanetReport(BAND_5, 0),
      payload: { ...heatPlanetReport(BAND_5, 0).payload, driveTicks: 120, driving: true },
    })
    expect(brokenCellsOf(drilling.events())).toEqual([])
    expect(drilling.vehicle().cutHeatCarry).toBeUndefined()
    expect(drilling.vehicle().heat.level).toEqual(driving.vehicle().heat.level)
  })
})

describe('the report cut carry in state (ticket 535)', () => {
  it('restores a snapshot holding both carries to the same digest', () => {
    const session = overGround()
    reportDrilling(session, 1, 60)
    expect(session.vehicle().cutEnergyCarry).toBeGreaterThan(0)
    expect(session.vehicle().cutHeatCarry).toBeGreaterThan(0)
    const restored = readSnapshot(JSON.parse(JSON.stringify(takeSnapshot(session.state()))))
    expect('state' in restored && stateDigest(restored.state)).toBe(stateDigest(session.state()))
  })

  it('refuses a snapshot whose carry is not whole and above 0, or a heat carry of a drill tick', () => {
    for (const [field, value] of [
      ['cutEnergyCarry', 0],
      ['cutEnergyCarry', 1.5],
      ['cutEnergyCarry', -1],
      ['cutHeatCarry', 0],
      ['cutHeatCarry', LAW_WORK_PER_DRILL_TICK],
      ['cutHeatCarry', 2.5],
    ] as const) {
      const snapshot = JSON.parse(JSON.stringify(takeSnapshot(overGround().state())))
      snapshot.state.players.p1.vehicle[field] = value
      expect(readSnapshot(snapshot)).toEqual({ problems: [expect.stringContaining(field)] })
    }
  })

  it('drops both carries on a new planet and with the tow, and keeps them through a dock', () => {
    const entering = overGround()
    reportDrilling(entering, 1, 60)
    entering.submit(61, { type: 'debug.setPlanet', payload: { planetIndex: 2 } })
    expect(carriesOf(entering.state())).toEqual({})
    const stranding = overGround()
    reportDrilling(stranding, 1, 60)
    stranding.submit(61, { type: 'debug.setEnergy', payload: { energy: '0' } })
    stranding.submit(62, poseAbove(GROUND, FACING.down))
    expect(stranding.vehicle().mode).toBe('stranded')
    expect(stranding.vehicle().cutEnergyCarry).toBeGreaterThan(0)
    stranding.submit(63, { type: 'requestRescue', payload: {} })
    expect(stranding.vehicle().mode).toBe('docked')
    expect(carriesOf(stranding.state())).toEqual({})
  })
})
