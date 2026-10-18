import { describe, expect, it } from 'vitest'
import { DRILL_STAMP_RADIUS_MM } from '../../constants/balance'
import { AUTHORITY_DEV_FLAGS, type AuthorityDevFlags } from '../../constants/devFlags'
import { MM_PER_METRE, TICKS_PER_SECOND } from '../../constants/physics'
import { drillStampOf } from '../vehicle/drillStamp'
import { FACING, type VehiclePose } from '../vehicle/vehiclePose'
import type { VehicleState } from '../vehicle/vehicleState'
import type { CommandIntent } from './authorityCommand'
import { vehicleOf } from './authorityState'
import { withDrillExactCarry, withReportCapsule } from './cutCarryFixtures'
import type { DomainEvent } from './domainEvent'
import { LAW_WORK_CLOCK, SUB_STEP_CLOCK, WHOLE_TICK_CLOCK } from './groundDrill'
import {
  CAPSULE_LAW_WORK_CLOCK,
  capsuleTailOf,
  reportedCutShapeOf,
  type CapsuleReport,
} from './reportedCapsule'
import { createScriptedSession, FREEZE_ENEMIES, poseAbove } from './scriptedSession'

// The report capsule (ticket 537, A7, the TD shape 6228947744 section 4 with the HS additions,
// bounded to interval 1 by the GD's ruling after the prototype round 6241320435): a report at
// interval 1 whose bite runs on from the previous report cuts the capsule between the two poses on
// the sub-step clock, its gear's cells on every tick, only with the exact carry on (interval 1 is
// live only with it); a 12-tick report, a fresh bite, a turn, a standstill, a step past one stamp
// radius, the exact carry off and the kill-switch off cut today's bare disc on today's clock,
// byte for byte.

const EXACT_CARRY_ON: AuthorityDevFlags = {
  ...AUTHORITY_DEV_FLAGS,
  'drill.reportCapsule': true,
  'drill.exactCarry': true,
}
const CAPSULE_OFF: AuthorityDevFlags = { ...EXACT_CARRY_ON, 'drill.reportCapsule': false }
const EXACT_CARRY_OFF: AuthorityDevFlags = { ...EXACT_CARRY_ON, 'drill.exactCarry': false }
const BARE_DISC_AS_SHIPPED = { tail: null, clock: WHOLE_TICK_CLOCK, cellsBeside: 'withBit' }

const PREVIOUS: VehiclePose = { x: 20_500, y: 280_500, vx: 0, vy: 0, upx: 0, upy: 1024, facing: 1 }

/** A vehicle last charged at tick 10 with `pose` reported. */
function vehicleAt(pose: VehiclePose | null, accountedTick = 10): VehicleState {
  const { vehicle } = createScriptedSession().state().players.p1
  return { ...vehicle, pose, accountedTick }
}

/** A report `stepMm` east of the previous pose at tick 11, one drill tick, unless overridden. */
function reportAfter(stepMm: number, report: Partial<CapsuleReport> = {}): CapsuleReport {
  return {
    before: vehicleAt(PREVIOUS),
    pose: { ...PREVIOUS, x: PREVIOUS.x + stepMm },
    isLifting: false,
    tick: 11,
    drillTicks: 1,
    ...report,
  }
}

function centreOf(pose: VehiclePose, isLifting = false) {
  const { xMm, yMm } = drillStampOf(pose, isLifting)
  return { xMm, yMm }
}

/** Rock 12 m under the surface east of the pad (`drillEventStreamFixtures.ts`). */
const START_MM = { x: 20_500, y: 280_500 }
/** A rig whose cells take several ticks under the stamp, so the shape of the cut shows. */
const SLOW_RIG = { drill_power: 60, drill_tip: 600 }

/**
 * The level track east at `speedMps`, reported every `interval` ticks for `ticks` ticks, from a
 * fresh rig, with the exact carry on as interval 1 is live.
 */
function cutEast(speedMps: number, ticks: number, interval = 1) {
  return withDrillExactCarry(true, () => cutEastAsShipped(speedMps, ticks, interval))
}

function cutEastAsShipped(speedMps: number, ticks: number, interval: number) {
  const session = createScriptedSession()
  session.submit(0, FREEZE_ENEMIES)
  for (const [upgradeId, level] of Object.entries(SLOW_RIG)) {
    session.submit(0, { type: 'debug.setUpgrade', payload: { upgradeId, level } })
  }
  const strideMm = (speedMps * MM_PER_METRE) / TICKS_PER_SECOND
  session.submit(0, reportEastAt(0, strideMm, 0))
  const events: DomainEvent[] = []
  for (let tick = interval; tick <= ticks; tick += interval) {
    session.submit(tick, { type: 'debug.setEnergy', payload: { energy: '150' } })
    events.push(...session.submit(tick, reportEastAt(tick, strideMm, interval)))
  }
  return { world: session.state().world, cells: destroyedCellsOf(events), events }
}

function reportEastAt(tick: number, strideMm: number, drillTicks: number): CommandIntent {
  const { payload } = poseAbove({ tx: 0, ty: 0 }, FACING.right, {
    drillTicks,
    driveTicks: drillTicks,
  })
  return {
    type: 'reportPose',
    payload: {
      ...payload,
      x: Math.round(START_MM.x + strideMm * tick),
      y: START_MM.y,
      driving: drillTicks > 0,
      drive: { x: 1, y: 0 },
    },
  }
}

function destroyedCellsOf(events: readonly DomainEvent[]): string[] {
  return events.flatMap((event) =>
    event.type === 'TileDestroyed' ? [`${event.tx},${event.ty}`] : [],
  )
}

describe('report capsule (ticket 537)', () => {
  it('starts at the previous pose’s stamp centre when the drill ran every tick since the last charged report', () => {
    expect(capsuleTailOf(reportAfter(50))).toEqual(centreOf(PREVIOUS))
  })

  it('keeps the tail at the stamp’s own lift and floor: a lifting report’s tail is the lifted centre', () => {
    const report = reportAfter(50, { isLifting: true })
    const tail = capsuleTailOf(report)
    expect(tail).toEqual(centreOf(PREVIOUS, true))
    expect(tail).not.toEqual(centreOf(PREVIOUS, false))
  })

  it('cuts the bare disc for a 12-tick report, even one within the cap whose drill ran all 12 ticks', () => {
    expect(capsuleTailOf(reportAfter(600, { tick: 22, drillTicks: 12 }))).toBeNull()
    expect(capsuleTailOf(reportAfter(50, { tick: 22, drillTicks: 12 }))).toBeNull()
  })

  it('cuts the bare disc for a 2-tick report and when the drill was off since the last charged report', () => {
    expect(capsuleTailOf(reportAfter(100, { tick: 12, drillTicks: 2 }))).toBeNull()
    expect(capsuleTailOf(reportAfter(50, { drillTicks: 0 }))).toBeNull()
  })

  it('cuts the bare disc on a turn', () => {
    const report = reportAfter(50)
    expect(capsuleTailOf({ ...report, pose: { ...report.pose, facing: FACING.down } })).toBeNull()
  })

  it('cuts the bare disc at a standstill and before any pose was reported', () => {
    expect(capsuleTailOf(reportAfter(0))).toBeNull()
    expect(capsuleTailOf(reportAfter(50, { before: vehicleAt(null) }))).toBeNull()
  })

  it('caps the step at one stamp radius: 950 mm is a capsule, 951 mm the bare disc', () => {
    expect(capsuleTailOf(reportAfter(DRILL_STAMP_RADIUS_MM))).toEqual(centreOf(PREVIOUS))
    expect(capsuleTailOf(reportAfter(DRILL_STAMP_RADIUS_MM + 1))).toBeNull()
  })

  it('counts the capsule on the sub-step clock, charged on the law work with the carry, its gear’s cells cut every tick', () => {
    const shape = reportedCutShapeOf(reportAfter(50), EXACT_CARRY_ON)
    expect(shape).toEqual({
      tail: centreOf(PREVIOUS),
      clock: CAPSULE_LAW_WORK_CLOCK,
      cellsBeside: 'everyTick',
    })
    expect(CAPSULE_LAW_WORK_CLOCK.subStepsPerTick).toBe(SUB_STEP_CLOCK.subStepsPerTick)
    expect(CAPSULE_LAW_WORK_CLOCK.subStepsPerTick).toBeGreaterThan(1)
    expect(CAPSULE_LAW_WORK_CLOCK.chargeOf).toBe(LAW_WORK_CLOCK.chargeOf)
    expect(CAPSULE_LAW_WORK_CLOCK.lawTimesOf).toBe(LAW_WORK_CLOCK.lawTimesOf)
  })

  it('cuts a 12-tick report and a fresh bite as the bare disc on the report’s own clock, its gear’s cells with the bit', () => {
    const twelve = reportAfter(600, { tick: 22, drillTicks: 12 })
    const fresh = reportAfter(50, { drillTicks: 0 })
    const bareDiscCharged = { tail: null, clock: LAW_WORK_CLOCK, cellsBeside: 'withBit' }
    expect(reportedCutShapeOf(twelve, EXACT_CARRY_ON)).toEqual(bareDiscCharged)
    expect(reportedCutShapeOf(fresh, EXACT_CARRY_ON)).toEqual(bareDiscCharged)
    expect(reportedCutShapeOf(twelve, EXACT_CARRY_OFF)).toEqual(BARE_DISC_AS_SHIPPED)
  })

  it('cuts the bare disc with the exact carry off, whatever the report, and with the kill-switch off', () => {
    expect(reportedCutShapeOf(reportAfter(50), EXACT_CARRY_OFF)).toEqual(BARE_DISC_AS_SHIPPED)
    expect(reportedCutShapeOf(reportAfter(50), CAPSULE_OFF)).toEqual({
      ...BARE_DISC_AS_SHIPPED,
      clock: LAW_WORK_CLOCK,
    })
  })

  it('ships on', () => {
    expect(AUTHORITY_DEV_FLAGS['drill.reportCapsule']).toBe(true)
  })

  it('cuts every cell the bare disc cut on a 3 m/s track, and more of the rim', () => {
    const on = withReportCapsule(true, () => cutEast(3, 240))
    const off = withReportCapsule(false, () => cutEast(3, 240))
    const cutOn = new Set(on.cells)
    expect(off.cells.length).toBeGreaterThan(5)
    expect(off.cells.filter((cell) => !cutOn.has(cell))).toEqual([])
    expect(on.cells.length).toBeGreaterThanOrEqual(off.cells.length)
    expect(on.world).not.toEqual(off.world)
  })

  it('falls back to today’s bare disc byte for byte past one stamp radius a tick', () => {
    const on = withReportCapsule(true, () => cutEast(60, 40))
    const off = withReportCapsule(false, () => cutEast(60, 40))
    expect(on.events.filter((event) => event.type === 'GroundChanged').length).toBeGreaterThan(5)
    expect(on.world).toEqual(off.world)
    expect(on.events).toEqual(off.events)
  })

  it('digests a 12-tick report within the cap byte for byte with the switch on and off', () => {
    const on = withReportCapsule(true, () => cutEast(3, 240, 12))
    const off = withReportCapsule(false, () => cutEast(3, 240, 12))
    expect(on.cells.length).toBeGreaterThan(5)
    expect(on.world).toEqual(off.world)
    expect(on.events).toEqual(off.events)
  })

  it('cuts protocol 86’s bare disc byte for byte with the exact carry off, the switch on or off', () => {
    const shipped = withDrillExactCarry(false, () => cutEastAsShipped(3, 120, 1))
    const off = withReportCapsule(false, () => shipped)
    const charged = cutEast(3, 120)
    expect(shipped.world).toEqual(off.world)
    expect(shipped.events).toEqual(off.events)
    expect(charged.world).not.toEqual(shipped.world)
  })

  it('leaves the vehicle’s reported pose as the next report’s previous pose', () => {
    const session = createScriptedSession()
    session.submit(0, reportEastAt(0, 50, 0))
    session.submit(1, reportEastAt(1, 50, 1))
    expect(vehicleOf(session.state(), 'p1').pose).toMatchObject({ x: START_MM.x + 50 })
  })
})
