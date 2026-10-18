import { describe, expect, it } from 'vitest'
import { AUTHORITY_DEV_FLAGS, type AuthorityDevFlags } from '../../constants/devFlags'
import { HEAT_UNITS_PER_POINT } from '../../constants/balance'
import { TICKS_PER_SECOND } from '../../constants/physics'
import { bandHeatPerSecond, drillHeatPerSecond } from '../economy/heatEconomy'
import { add, fromSafeInteger, mul, toCanonical } from '../money'
import { LAW_WORK_PER_DRILL_TICK } from '../vehicle/cutCarry'
import { NO_DRIVE } from '../vehicle/driveSigns'
import { heatUnitsPerTickOf } from '../vehicle/vehicleHeat'
import { FACING } from '../vehicle/vehiclePose'
import { vehicleOf, withVehicle, type AuthorityState } from './authorityState'
import { followHeat, type HeatActivity } from './heatRules'
import { followReportedHeat } from './reportedDrill'
import { createScriptedSession, FREEZE_ENEMIES, GROUND, poseAbove } from './scriptedSession'
import { readSnapshot, takeSnapshot } from './sessionSnapshot'
import { stateDigest } from './stateDigest'

// Heat per unit of law work, uncapped (ticket 541, shape (b): the TD seam 6232743242, Systems'
// price 6232736622, VS and G&V voting (b), the GD's acceptance and Bjor's go). Behind the
// authority's `heat.workUncapped`, off: a report whose drill ticks fit the ticks since the gauge
// settled heats the same either way (the bot's whole-tick clock); past them, the flag heats every
// drill tick of work over the elapsed ticks where the #113 rule dropped the rest, so the heat paid
// no longer depends on the report cadence. The gauge at its max, idle cooling and the carry's
// part of a tick are as before; a report at the tick the gauge settled keeps the exact carry's
// work for the next.

const OFF: AuthorityDevFlags = { ...AUTHORITY_DEV_FLAGS, 'heat.workUncapped': false }
const ON: AuthorityDevFlags = { ...AUTHORITY_DEV_FLAGS, 'heat.workUncapped': true }
const EXACT_ON: AuthorityDevFlags = { ...ON, 'drill.exactCarry': true }

/** Planet 8, the first heat planet, and band-5 rock straight above its core (`heatRun.test.ts`). */
const HEAT_PLANET = 8
const BAND_5 = { x: 500, y: 40500 }
const BAND = 5

/** A report at band 5 facing down, drilling for `drillTicks`. */
function heatPlanetReport(drillTicks: number) {
  return {
    type: 'reportPose' as const,
    payload: {
      ...poseAbove(GROUND, FACING.down, { drillTicks }).payload,
      ...BAND_5,
      drive: NO_DRIVE,
    },
  }
}

/** The vehicle on planet 8 at band 5 with the gauge settled at tick 0 and at `heat` points. */
function onHeatPlanet(heat = 0): AuthorityState {
  const session = createScriptedSession()
  session.submit(0, { type: 'debug.setPlanet', payload: { planetIndex: HEAT_PLANET } })
  session.submit(0, FREEZE_ENEMIES)
  session.submit(0, heatPlanetReport(0))
  session.submit(0, { type: 'debug.setHeat', payload: { heat } })
  return session.state()
}

function heatAt(tick: number, activity: HeatActivity, flags: AuthorityDevFlags, heat = 0) {
  return followHeat(onHeatPlanet(heat), 'p1', tick, activity, flags)
}

const levelOf = (state: AuthorityState) => vehicleOf(state, 'p1').heat.level
const drilling = (drillTicks: number): HeatActivity => ({ drillTicks, isIdle: false })

/** The units a tick of band 5 heat plus `drills` drill ticks' heat comes to, per second rounded up. */
function unitsPerTickWithDrills(drills: number): number {
  const drill = mul(drillHeatPerSecond(HEAT_PLANET), fromSafeInteger(drills))
  return heatUnitsPerTickOf(add(bandHeatPerSecond(HEAT_PLANET, BAND), drill))
}

/** The exact units `elapsed` ticks of band 5 heat and `work` drill ticks' heat come to. */
function exactUnitsOf(elapsed: number, work: number): number {
  const band = Number(toCanonical(bandHeatPerSecond(HEAT_PLANET, BAND)))
  const drill = Number(toCanonical(drillHeatPerSecond(HEAT_PLANET)))
  return ((elapsed * band + work * drill) * HEAT_UNITS_PER_POINT) / TICKS_PER_SECOND
}

function withHeatCarry(state: AuthorityState, cutHeatCarry: number): AuthorityState {
  return withVehicle(state, 'p1', { ...vehicleOf(state, 'p1'), cutHeatCarry })
}

function reportAt(tick: number, drillTicks: number) {
  return { playerId: 'p1', tick, seq: 9, ...heatPlanetReport(drillTicks) }
}

describe('heat per unit of law work (ticket 541, heat.workUncapped)', () => {
  it('ships off', () => {
    expect(AUTHORITY_DEV_FLAGS['heat.workUncapped']).toBe(false)
  })

  it('heats a report whose drill ticks fit the elapsed ticks the same with the flag on or off', () => {
    for (const drillTicks of [0, 1, 7, 12]) {
      expect(heatAt(12, drilling(drillTicks), ON)).toEqual(heatAt(12, drilling(drillTicks), OFF))
    }
  })

  it('heats every drill tick of work past the elapsed ticks, where the capped rule drops them', () => {
    const uncapped = levelOf(heatAt(12, drilling(24), ON).state)
    const capped = levelOf(heatAt(12, drilling(24), OFF).state)
    expect(uncapped).toBe(12 * unitsPerTickWithDrills(2))
    expect(capped).toBe(12 * unitsPerTickWithDrills(1))
    expect(uncapped).toBeGreaterThan(capped)
  })

  it('heats the same work the same at a report every tick and every 12 ticks', () => {
    let everyTick = onHeatPlanet()
    for (let tick = 1; tick <= 12; tick++) {
      everyTick = followHeat(everyTick, 'p1', tick, drilling(2), ON).state
    }
    expect(levelOf(everyTick)).toBe(levelOf(heatAt(12, drilling(24), ON).state))
  })

  it('scales by an exact ratio of ticks, within a unit a tick above the exact heat and the same each time', () => {
    const first = levelOf(heatAt(12, drilling(17), ON).state)
    expect(levelOf(heatAt(12, drilling(17), ON).state)).toBe(first)
    expect(first).toBeGreaterThanOrEqual(exactUnitsOf(12, 17))
    expect(first).toBeLessThan(exactUnitsOf(12, 17) + 12)
  })

  it('holds the max and damages the hull at a full gauge as the capped rule does', () => {
    const uncapped = heatAt(12, drilling(24), ON, 100)
    const capped = heatAt(12, drilling(24), OFF, 100)
    expect(uncapped).toEqual(capped)
    expect(uncapped.events.some((event) => event.type === 'VehicleDamaged')).toBe(true)
  })

  it('heats nothing for drilling while the vehicle is idle', () => {
    const idle: HeatActivity = { drillTicks: 0, isIdle: true }
    expect(heatAt(12, idle, ON, 50)).toEqual(heatAt(12, idle, OFF, 50))
  })
})

describe('the charged report under heat.workUncapped (ticket 541)', () => {
  it("heats all the carry's whole drill ticks over fewer elapsed ticks, keeping the part of a tick", () => {
    const state = onHeatPlanet()
    const cut = withHeatCarry(state, LAW_WORK_PER_DRILL_TICK * 20 + 30)
    const heated = followReportedHeat(cut, reportAt(12, 12), vehicleOf(state, 'p1'), EXACT_ON)
    expect(levelOf(heated.state)).toBe(levelOf(heatAt(12, drilling(20), ON).state))
    expect(vehicleOf(heated.state, 'p1').cutHeatCarry).toBe(30)
  })

  it('keeps the carry whole on a report at the tick the gauge settled, and heats it at the next', () => {
    const state = onHeatPlanet()
    const carry = LAW_WORK_PER_DRILL_TICK * 3 + 30
    const before = vehicleOf(state, 'p1')
    const held = followReportedHeat(withHeatCarry(state, carry), reportAt(0, 0), before, EXACT_ON)
    expect(vehicleOf(held.state, 'p1').cutHeatCarry).toBe(carry)
    expect(levelOf(held.state)).toBe(levelOf(state))
    const next = followReportedHeat(held.state, reportAt(12, 12), before, EXACT_ON)
    expect(levelOf(next.state)).toBe(levelOf(heatAt(12, drilling(3), ON).state))
    expect(vehicleOf(next.state, 'p1').cutHeatCarry).toBe(30)
  })

  it('restores a snapshot holding a carry of more than a drill tick to the same digest', () => {
    const held = withHeatCarry(onHeatPlanet(), LAW_WORK_PER_DRILL_TICK * 3 + 30)
    const restored = readSnapshot(JSON.parse(JSON.stringify(takeSnapshot(held))))
    expect('state' in restored && stateDigest(restored.state)).toBe(stateDigest(held))
  })
})
