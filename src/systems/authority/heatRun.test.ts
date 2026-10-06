import { describe, expect, it } from 'vitest'
import { TICKS_PER_SECOND } from '../../constants/physics'
import { heatPointsOf } from '../vehicle/vehicleHeat'
import { FACING } from '../vehicle/vehiclePose'
import { fromCanonical, fromSafeInteger, mul, sub, toCanonical } from '../money'
import type { CommandIntent } from './authorityCommand'
import type { DomainEvent } from './domainEvent'
import { heatThrottledDrill } from './heatRules'
import { createScriptedSession, FREEZE_ENEMIES, type ScriptedSession } from './scriptedSession'

/** Planet 8, the first heat planet: radius 676 tiles, band 5 from 67.6 tiles in, core 10. */
const HEAT_PLANET = 8
/** Band-5 rock straight above the core, 40 m from the centre. */
const BAND_5 = { x: 500, y: 40500 }

const setHeat = (heat: number): CommandIntent => ({ type: 'debug.setHeat', payload: { heat } })

/** A vehicle on planet 8, enemies frozen, at `at` with a full tank. */
function onHeatPlanet(): ScriptedSession {
  const session = createScriptedSession()
  session.submit(0, { type: 'debug.setPlanet', payload: { planetIndex: HEAT_PLANET } })
  session.submit(0, FREEZE_ENEMIES)
  session.submit(0, { type: 'debug.setMoney', payload: { amount: '1e30' } })
  return session
}

/** A pose report at `at`, facing down, with the given action ticks since the last report. */
function reportAt(at: { x: number; y: number }, ticks: { drill?: number; drive?: number }) {
  return {
    type: 'reportPose' as const,
    payload: {
      x: at.x,
      y: at.y,
      vx: 0,
      vy: 0,
      upx: 0,
      upy: 1024,
      facing: FACING.down,
      driving: (ticks.drive ?? 0) > 0,
      thrusting: false,
      drilling: (ticks.drill ?? 0) > 0,
      thrustTicks: 0,
      driveTicks: ticks.drive ?? 0,
      drillTicks: ticks.drill ?? 0,
    },
  }
}

/** Reports every `interval` ticks from `firstTick` for `seconds`, refilling the tank each time. */
function reportFor(
  session: ScriptedSession,
  firstTick: number,
  seconds: number,
  interval: number,
  ticks: (interval: number) => { drill?: number; drive?: number },
  at = BAND_5,
): number {
  const lastTick = firstTick + seconds * TICKS_PER_SECOND
  for (let tick = firstTick + interval; tick <= lastTick; tick += interval) {
    session.submit(tick, { type: 'debug.setEnergy', payload: { energy: '150' } })
    session.submit(tick, reportAt(at, ticks(interval)))
  }
  return lastTick
}

const drilling = (interval: number) => ({ drill: interval })
const driving = (interval: number) => ({ drive: interval })

function firstTickOf(events: readonly DomainEvent[], match: (event: DomainEvent) => boolean) {
  return events.find(match)?.tick ?? null
}

const isThreshold = (level: number) => (event: DomainEvent) =>
  event.type === 'HeatThreshold' && event.level === level
const isHeatDamage = (event: DomainEvent) =>
  event.type === 'VehicleDamaged' && event.source === 'heat'

function gaugePoints(session: ScriptedSession): number {
  return Number(toCanonical(heatPointsOf(session.vehicle().heat.level)))
}

describe('heat gauge (#113 numbers acceptance 1)', () => {
  it('reaches 70 from cold after 108 +- 5 s of drilling band 5 on planet 8', () => {
    const session = onHeatPlanet()
    session.submit(0, reportAt(BAND_5, {}))
    reportFor(session, 0, 120, 12, drilling)
    const seconds = (firstTickOf(session.events(), isThreshold(70)) ?? 0) / TICKS_PER_SECOND
    expect(seconds).toBeGreaterThanOrEqual(103)
    expect(seconds).toBeLessThanOrEqual(113)
  })

  it('heats the same at 5 and 10 pose reports a second', () => {
    const after100Seconds = (interval: number) => {
      const session = onHeatPlanet()
      session.submit(0, reportAt(BAND_5, {}))
      reportFor(session, 0, 100, interval, drilling)
      return session.vehicle().heat.level
    }
    expect(after100Seconds(6)).toBe(after100Seconds(12))
  })

  it('throttles the drill from 70, before the hull takes any heat damage at 100', () => {
    const session = onHeatPlanet()
    session.submit(0, reportAt(BAND_5, {}))
    reportFor(session, 0, 200, 12, drilling)
    const events = session.events()
    const throttled = firstTickOf(events, (event) => event.type === 'OverheatStarted')
    const damaged = firstTickOf(events, isHeatDamage)
    expect(throttled).not.toBeNull()
    expect(damaged).not.toBeNull()
    expect(throttled as number).toBeLessThan(damaged as number)
    expect(firstTickOf(events, isThreshold(100)) as number).toBeLessThanOrEqual(damaged as number)
  })

  it('halves the drill at a full gauge', () => {
    const session = onHeatPlanet()
    session.submit(0, reportAt(BAND_5, {}))
    const cool = heatThrottledDrill(HEAT_PLANET, session.vehicle()).drillPower
    session.submit(1, setHeat(100))
    const hot = heatThrottledDrill(HEAT_PLANET, session.vehicle()).drillPower
    expect(mul(hot, fromSafeInteger(2))).toEqual(cool)
  })

  it('takes 2% of hullMax a second at the max', () => {
    const session = onHeatPlanet()
    session.submit(0, reportAt(BAND_5, {}))
    session.submit(1, setHeat(100))
    const before = session.vehicle().hull
    reportFor(session, 1, 5, 12, drilling)
    const lost = sub(before, session.vehicle().hull)
    expect(lost).toEqual(mul(before, fromCanonical('0.1')))
  })

  it('ends the throttle when the gauge falls back below 70', () => {
    const session = onHeatPlanet()
    session.submit(0, reportAt({ x: 500, y: 600000 }, {}))
    session.submit(1, setHeat(80))
    session.submit(2, reportAt({ x: 500, y: 600000 }, { drill: 1 }))
    reportFor(session, 2, 40, 12, () => ({}), { x: 500, y: 600000 })
    expect(session.events().some((event) => event.type === 'OverheatEnded')).toBe(true)
  })
})

describe('heat gauge cooling (#113)', () => {
  it('heats a vehicle driving through band 5 and cools one stopped higher up', () => {
    const moving = onHeatPlanet()
    moving.submit(0, reportAt(BAND_5, {}))
    reportFor(moving, 0, 30, 12, driving)
    expect(gaugePoints(moving)).toBe(15)
    const stopped = onHeatPlanet()
    const band3 = { x: 500, y: 300000 }
    stopped.submit(0, reportAt(band3, {}))
    stopped.submit(1, setHeat(50))
    reportFor(stopped, 1, 10, 12, () => ({}), band3)
    expect(gaugePoints(stopped)).toBeLessThan(50)
  })

  it('cools the gauge by 10 a second while the vehicle is docked', () => {
    const session = onHeatPlanet()
    session.submit(0, { type: 'debug.teleportToDock', payload: { bay: 'sell' } })
    session.submit(0, setHeat(80))
    session.submit(5 * TICKS_PER_SECOND, { type: 'undock', payload: {} })
    expect(gaugePoints(session)).toBe(30)
  })

  it('cools a docked vehicle at the platform rate whether or not it reports its pose', () => {
    const session = onHeatPlanet()
    session.submit(0, { type: 'debug.teleportToDock', payload: { bay: 'sell' } })
    session.submit(0, setHeat(80))
    const { pose } = session.vehicle()
    reportFor(session, 0, 3, 12, () => ({}), { x: pose?.x ?? 0, y: pose?.y ?? 0 })
    session.submit(5 * TICKS_PER_SECOND, { type: 'undock', payload: {} })
    expect(gaugePoints(session)).toBe(30)
  })

  it('keeps the gauge at 0 off the heat planets', () => {
    const session = createScriptedSession()
    session.submit(0, FREEZE_ENEMIES)
    session.submit(0, reportAt(BAND_5, {}))
    reportFor(session, 0, 30, 12, drilling)
    expect(session.vehicle().heat.level).toBe(0)
  })
})

/** A level band-5 tunnel 12 m long, east of `BAND_5`, carved and then lined by the drill in `liningType`. */
function linedBand5Tunnel(liningType: string): { session: ScriptedSession; tick: number } {
  const session = onHeatPlanet()
  session.submit(0, { type: 'debug.setLiningType', payload: { liningType } })
  // Grade 5 holds band 5, so the tunnel never collapses and takes its lining with it (#43).
  session.submit(0, { type: 'debug.setCasingGrade', payload: { grade: 5 } })
  for (let x = BAND_5.x; x <= BAND_5.x + 12000; x += 500) {
    session.submit(0, {
      type: 'debug.carveCircle',
      payload: { x, y: BAND_5.y, radius: 950, amount: 255 },
    })
  }
  let tick = 0
  for (let x = BAND_5.x; x <= BAND_5.x + 12000; x += 100) {
    tick += 12
    session.submit(tick, { type: 'debug.setEnergy', payload: { energy: '150' } })
    session.submit(tick, {
      ...reportAt({ x, y: BAND_5.y }, { drill: 12 }),
      payload: { ...reportAt({ x, y: BAND_5.y }, { drill: 12 }).payload, facing: FACING.right },
    })
  }
  return { session, tick }
}

describe('refractory corridor (#113 numbers acceptance 2)', () => {
  it('cools a vehicle driving inside a refractory corridor, even in band 5', () => {
    const { session, tick } = linedBand5Tunnel('refractory')
    const inside = { x: BAND_5.x + 6000, y: BAND_5.y }
    session.submit(tick, reportAt(inside, {}))
    session.submit(tick, setHeat(80))
    reportFor(session, tick, 20, 12, driving, inside)
    expect(gaugePoints(session)).toBe(70)
  })

  it('keeps heating a vehicle driving the same tunnel lined in standard lining', () => {
    const { session, tick } = linedBand5Tunnel('standard')
    const inside = { x: BAND_5.x + 6000, y: BAND_5.y }
    session.submit(tick, reportAt(inside, {}))
    session.submit(tick, setHeat(50))
    reportFor(session, tick, 20, 12, driving, inside)
    expect(gaugePoints(session)).toBe(60)
  })
})
