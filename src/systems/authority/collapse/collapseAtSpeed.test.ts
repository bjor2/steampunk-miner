import { describe, expect, it } from 'vitest'
import {
  COLLAPSE_ACTIVE_RADIUS_MM,
  COLLAPSE_WARN_TICKS,
  DRILL_STAMP_OFFSET_MM,
  STEP_BOUND_TOLERANCE_MM,
} from '../../../constants/balance'
import { withRegistrations } from '../../../registries/registrar'
import { FACING } from '../../vehicle/vehiclePose'
import { vehicleOf } from '../authorityState'
import type { CommandIntent } from '../authorityCommand'
import { ofType } from '../charges/chargeFixtures'
import type { DomainEvent } from '../domainEvent'
import { engineStepReaching } from '../driveRigFixtures'
import { createScriptedSession, type ScriptedSession } from '../scriptedSession'
import { RIG_TIP, strideOfSpeed, weakestDrillPower } from '../speedSlabFixtures'
import { stepBoundsAt } from '../stepBoundRead'
import { braceCommand, braceProbeSlice } from './braceFixtures'
import {
  BAND_2_Y,
  poseAt,
  prepareDigger,
  TUNNEL_FROM_X,
  TUNNEL_TO_X,
  tunnelIntents,
} from './collapseFixtures'

// The 84 m/s collapse row of ticket 560 (GD amendment 3 on #551; #341 stands): the collapse
// warning is not scaled with speed, so a rig leaving a warned block at 84 m/s outruns it. The
// weak band-2 tunnel warns its blocks at tick 10 with the rig at its middle; the rig then cuts east
// out of it by `drillStep` a tick and a report every 12, as the live client does, its own lining
// at grade 2 (band 2's need), so only the tunnel warns. At the refill the rig is far past the 16 m
// radius: every warning is cancelled, nothing refills and nothing is crushed. The outrun is exact
// (HS 6254968595): the cut's own events are those of the same run past a tunnel that never warned,
// and a braced block stays out of the refill. The radius and the 60-tick lead are untouched.
//
// Level-leg pacing re-pin (drive-bound), ticket 732 under #644: since #723 a sideways cut moves
// at min(drill rate, drive speed), and drill purchases never move the drive (Bjor), so on the
// bare engine the rig crawled 30.6 m at 6 m/s and never left the radius. The rig now buys the
// weakest engine whose drive reaches 84 m/s (`engineStepReaching`); the cap is not lifted, and
// the stride, the drill rule and every bar are those of the pre-#723 row.

const WARN_TICK = 10
const SPEED_M_PER_S = 84
const STRIDE_MM = strideOfSpeed(SPEED_M_PER_S)
const LAST_TICK = 130
const REPORT_EVERY = 12
const TUNNEL_MIDDLE_X = (TUNNEL_FROM_X + TUNNEL_TO_X) / 2
const CUT_EVENT_TYPES = new Set(['TileDestroyed', 'CargoAdded', 'DrillGated'])

/** The weakest drill whose law step through band-2 rock reaches the 84 m/s stride. */
const RIG_DRILL_POWER = weakestDrillPower((drillPower) => {
  const session = createScriptedSession()
  armRig(session, drillPower)
  session.submit(1, poseAt(TUNNEL_MIDDLE_X, BAND_2_Y))
  return stepBoundsAt(session.state(), 'p1').cuttingMm - STEP_BOUND_TOLERANCE_MM >= STRIDE_MM
})

function armRig(session: ScriptedSession, drillPower: number): void {
  prepareDigger(session, 1, 2)
  for (const [upgradeId, level] of [
    ['drill_tip', RIG_TIP],
    ['drill_power', drillPower],
    ['engine', engineStepReaching(SPEED_M_PER_S)],
  ] as const) {
    session.submit(1, { type: 'debug.setUpgrade', payload: { upgradeId, level } })
  }
}

/** The tunnel lined at `grade` round the rig at tick 10, then the rig cuts east at 84 m/s. */
function outrunFrom(grade: number, onWarned: (session: ScriptedSession) => void = () => {}) {
  const session = createScriptedSession()
  armRig(session, RIG_DRILL_POWER)
  tunnelIntents(grade).forEach((intent) => session.submit(WARN_TICK, intent))
  onWarned(session)
  cutEastAtSpeed(session)
  return session
}

/** The body one stride east a tick, never past where the cut let it, as the live body moves. */
function cutEastAtSpeed(session: ScriptedSession): void {
  let bodyX = TUNNEL_MIDDLE_X
  for (let tick = WARN_TICK + 1; tick <= LAST_TICK; tick++) {
    session.advanceTo(tick)
    bodyX = bodyXAfter(session, bodyX)
    session.submit(tick, stepAt(bodyX))
    if (tick % REPORT_EVERY === 0) reportAt(session, tick, bodyX)
  }
}

function bodyXAfter(session: ScriptedSession, bodyX: number): number {
  const cursor = session.vehicle().sweptCut
  const cutLets = cursor === undefined ? bodyX : cursor.xMm - DRILL_STAMP_OFFSET_MM
  return Math.max(bodyX, Math.min(bodyX + STRIDE_MM, cutLets))
}

function stepAt(x: number): CommandIntent<'drillStep'> {
  return {
    type: 'drillStep',
    payload: { x, y: BAND_2_Y, facing: FACING.right, drive: { x: 1, y: 0 } },
  }
}

/** A report with a full tank and hull, so the ground alone decides the run. */
function reportAt(session: ScriptedSession, tick: number, x: number): void {
  session.submit(tick, { type: 'debug.setEnergy', payload: { energy: '150' } })
  session.submit(tick, { type: 'debug.setHull', payload: { hull: '100' } })
  session.submit(tick, poseAt(x, BAND_2_Y, REPORT_EVERY))
}

const isCutEvent = (event: DomainEvent) =>
  CUT_EVENT_TYPES.has(event.type) || event.type.startsWith('codex.')

const warnedBlocksOf = (session: ScriptedSession) =>
  ofType(session.events(), 'CollapseWarned').map(({ block }) => block)

describe('a collapse outrun at 84 m/s (ticket 560)', () => {
  it('keeps the 16 m radius and the 60-tick lead (#341 stands)', () => {
    expect(COLLAPSE_ACTIVE_RADIUS_MM).toBe(16_000)
    expect(COLLAPSE_WARN_TICKS).toBe(60)
  })

  it('cancels every warning by its refill tick, refilling nothing and crushing no one', () => {
    const session = outrunFrom(1)
    session.advanceTo(LAST_TICK + 2 * COLLAPSE_WARN_TICKS)
    const warned = warnedBlocksOf(session)
    expect(warned.length).toBeGreaterThan(0)
    const cancelled = ofType(session.events(), 'CollapseCancelled')
    expect(cancelled.map(({ block }) => block).sort()).toEqual([...warned].sort())
    expect(cancelled.every(({ tick }) => tick <= WARN_TICK + COLLAPSE_WARN_TICKS)).toBe(true)
    expect(ofType(session.events(), 'CollapseStarted')).toEqual([])
    expect(ofType(session.events(), 'VehicleDamaged')).toEqual([])
    expect(ofType(session.events(), 'CommandRejected')).toEqual([])
  })

  // Nine tenths of the stride from the warning to the last report: the body waits on the cut where
  // the tunnel's lining ends, nowhere else.
  it('carries the rig east at its 84 m/s stride, far past the radius', () => {
    const session = outrunFrom(1)
    const lastReportTick = LAST_TICK - (LAST_TICK % REPORT_EVERY)
    const reported = vehicleOf(session.state(), 'p1').pose
    const travelledMm = (reported?.x ?? 0) - TUNNEL_MIDDLE_X
    expect(travelledMm).toBeGreaterThan(0.9 * STRIDE_MM * (lastReportTick - WARN_TICK))
    expect(travelledMm).toBeGreaterThan(COLLAPSE_ACTIVE_RADIUS_MM)
  })

  it('cuts, yields and reports exactly as past a tunnel that never warned', () => {
    const outrun = outrunFrom(1)
    const unwarned = outrunFrom(2)
    expect(warnedBlocksOf(unwarned)).toEqual([])
    const cutEvents = (session: ScriptedSession) => session.events().filter(isCutEvent)
    expect(cutEvents(outrun).length).toBeGreaterThan(0)
    expect(cutEvents(outrun)).toEqual(cutEvents(unwarned))
  })

  it('never refills a braced block as the rig outruns it', () =>
    withRegistrations([braceProbeSlice()], () => {
      let braced = ''
      const session = outrunFrom(1, (warned) => {
        braced = warnedBlocksOf(warned)[0]
        warned.submit(WARN_TICK, braceCommand([braced]))
      })
      session.advanceTo(LAST_TICK + 4 * COLLAPSE_WARN_TICKS)
      expect(braced).not.toBe('')
      const started = ofType(session.events(), 'CollapseStarted')
      expect(started.filter(({ block }) => block === braced)).toEqual([])
      expect(started).toEqual([])
    }))
})
