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
import { LAW_WORK_CLOCK, WHOLE_TICK_CLOCK } from './groundDrill'
import {
  CAPSULE_LAW_WORK_CLOCK,
  CAPSULE_TICK_CLOCK,
  capsuleTailOf,
  reportedCutShapeOf,
  type CapsuleReport,
} from './reportedCapsule'
import { createScriptedSession, FREEZE_ENEMIES, poseAbove } from './scriptedSession'

// The report capsule (ticket 537, A7, the TD shape 6228947744 section 4 with the HS additions):
// a report whose bite runs on from the previous report cuts the capsule between the two poses on
// the sub-step clock; a fresh bite, a turn, a standstill, a step past one stamp radius and the
// kill-switch off cut today's bare disc on today's clock, byte for byte.

const CAPSULE_ON: AuthorityDevFlags = {
  ...AUTHORITY_DEV_FLAGS,
  'drill.reportCapsule': true,
  'drill.exactCarry': false,
}
const CAPSULE_OFF: AuthorityDevFlags = { ...CAPSULE_ON, 'drill.reportCapsule': false }
const EXACT_CARRY_ON: AuthorityDevFlags = { ...CAPSULE_ON, 'drill.exactCarry': true }

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

/** The level track east at `speedMps`, reported every tick for `ticks` ticks, from a fresh rig. */
function cutEast(speedMps: number, ticks: number) {
  const session = createScriptedSession()
  session.submit(0, FREEZE_ENEMIES)
  for (const [upgradeId, level] of Object.entries(SLOW_RIG)) {
    session.submit(0, { type: 'debug.setUpgrade', payload: { upgradeId, level } })
  }
  const strideMm = (speedMps * MM_PER_METRE) / TICKS_PER_SECOND
  session.submit(0, reportEastAt(0, strideMm, 0))
  const events: DomainEvent[] = []
  for (let tick = 1; tick <= ticks; tick++) {
    session.submit(tick, { type: 'debug.setEnergy', payload: { energy: '150' } })
    events.push(...session.submit(tick, reportEastAt(tick, strideMm, 1)))
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

  it('runs on across 12-tick reports too, when the drill ran all 12 ticks', () => {
    const report = reportAfter(600, { tick: 22, drillTicks: 12 })
    expect(capsuleTailOf(report)).toEqual(centreOf(PREVIOUS))
  })

  it('cuts the bare disc when the drill was off for a tick since the last charged report', () => {
    expect(capsuleTailOf(reportAfter(600, { tick: 22, drillTicks: 11 }))).toBeNull()
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

  it('counts the capsule on the sub-step clock, charged as the bare disc is charged', () => {
    expect(reportedCutShapeOf(reportAfter(50), CAPSULE_ON).clock).toBe(CAPSULE_TICK_CLOCK)
    expect(reportedCutShapeOf(reportAfter(50), EXACT_CARRY_ON).clock).toBe(CAPSULE_LAW_WORK_CLOCK)
    expect(CAPSULE_TICK_CLOCK.subStepsPerTick).toBeGreaterThan(1)
    expect(CAPSULE_TICK_CLOCK.chargeOf).toBe(WHOLE_TICK_CLOCK.chargeOf)
    expect(CAPSULE_LAW_WORK_CLOCK.subStepsPerTick).toBe(CAPSULE_TICK_CLOCK.subStepsPerTick)
    expect(CAPSULE_LAW_WORK_CLOCK.chargeOf).toBe(LAW_WORK_CLOCK.chargeOf)
    expect(CAPSULE_LAW_WORK_CLOCK.lawTimesOf).toBe(LAW_WORK_CLOCK.lawTimesOf)
  })

  it('counts a bare disc on today’s clock, and everything on it with the kill-switch off', () => {
    const fresh = reportAfter(600, { tick: 22, drillTicks: 11 })
    expect(reportedCutShapeOf(fresh, CAPSULE_ON)).toEqual({ tail: null, clock: WHOLE_TICK_CLOCK })
    expect(reportedCutShapeOf(fresh, EXACT_CARRY_ON).clock).toBe(LAW_WORK_CLOCK)
    expect(reportedCutShapeOf(reportAfter(50), CAPSULE_OFF)).toEqual({
      tail: null,
      clock: WHOLE_TICK_CLOCK,
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

  it('cuts the same cells and ground with the exact carry on or off (A6’s regression gate)', () => {
    const charged = withDrillExactCarry(true, () => cutEast(3, 120))
    const whole = withDrillExactCarry(false, () => cutEast(3, 120))
    expect(charged.cells).toEqual(whole.cells)
    expect(charged.world).toEqual(whole.world)
  })

  it('leaves the vehicle’s reported pose as the next report’s previous pose', () => {
    const session = createScriptedSession()
    session.submit(0, reportEastAt(0, 50, 0))
    session.submit(1, reportEastAt(1, 50, 1))
    expect(vehicleOf(session.state(), 'p1').pose).toMatchObject({ x: START_MM.x + 50 })
  })
})
