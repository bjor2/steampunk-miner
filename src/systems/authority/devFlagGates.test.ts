import { describe, expect, it } from 'vitest'
import type { DevFlags } from '../../constants/devFlags'
import { withRegistrations } from '../../registries/registrar'
import { NO_DRIVE } from '../vehicle/driveSigns'
import { drillReportIntervalOf } from '../vehicle/poseReport'
import { FACING } from '../vehicle/vehiclePose'
import type { TilePoint } from '../world/tileGrid'
import { CELL_KIND, kindOfCell } from '../world/worldCell'
import { cellAt } from '../world/worldState'
import type { DomainEvent } from './domainEvent'
import { AUTHORITY_FLAG_IDS, flagsOf, type DevFlagDelta } from './devFlagState'
import { drillGatedAt, refusingGateAt } from './gatedBiteFixtures'
import {
  createScriptedSession,
  FREEZE_ENEMIES,
  PARAMS,
  poseAbove,
  surfaceOreTiles,
  type ScriptedSession,
} from './scriptedSession'

// HS (b) on #547: the gate check is independent of every flag. Under each of the 64 combinations
// of the authority's flags, a gated cell stops a held report, a report path moving onto it (the
// capsule's bite) and the swept cut's steps; it is never cut, and a held bite raises `DrillGated`
// for it once.

const REPORT_PATH: DevFlags = { 'drill.sweptCut': false, 'drill.reportEveryTick': true }
const [ORE_TILE] = surfaceOreTiles(1)
const GATE = refusingGateAt([ORE_TILE])
const HOLD_TICKS = 48
const APPROACH_MM = 1500
const APPROACH_MM_PER_TICK = 25

/** Every combination of the six flags, as the delta `debug.setFlags` would send. */
const COMBINATIONS: DevFlagDelta[] = Array.from(
  { length: 2 ** AUTHORITY_FLAG_IDS.length },
  (_, bits) =>
    Object.fromEntries(AUTHORITY_FLAG_IDS.map((id, at) => [id, (bits & (1 << at)) !== 0])),
)

const nameOf = (delta: DevFlagDelta) =>
  AUTHORITY_FLAG_IDS.filter((id) => delta[id] === false).join('+') || 'all on'

function flaggedSession(delta: DevFlagDelta): ScriptedSession {
  const session = createScriptedSession()
  session.submit(0, FREEZE_ENEMIES)
  session.submit(0, { type: 'debug.setFlags', payload: { delta } })
  return session
}

/** The vehicle `heightMm` above its pose over the gated cell, facing down onto it. */
function poseOver(heightMm: number, drillTicks: number) {
  const { payload } = poseAbove(ORE_TILE, FACING.down, { drillTicks })
  return { type: 'reportPose' as const, payload: { ...payload, y: payload.y + heightMm } }
}

/** Reports at the cadence the session's flags give, the rig `heightAt(tick)` mm above the cell. */
function reportDown(session: ScriptedSession, heightAt: (tick: number) => number): DomainEvent[][] {
  const events: DomainEvent[][] = []
  let lastReport = 0
  for (let tick = 1; tick <= HOLD_TICKS + APPROACH_MM / APPROACH_MM_PER_TICK; tick++) {
    const interval = drillReportIntervalOf(REPORT_PATH, flagsOf(session.state()))
    if (tick - lastReport < interval) continue
    events.push(session.submit(tick, poseOver(heightAt(tick), tick - lastReport)))
    lastReport = tick
  }
  return events
}

function stepDown(session: ScriptedSession): DomainEvent[][] {
  const events: DomainEvent[][] = []
  const { payload } = poseAbove(ORE_TILE, FACING.down)
  for (let tick = 1; tick <= HOLD_TICKS + APPROACH_MM / APPROACH_MM_PER_TICK; tick++) {
    const y = payload.y + approachHeightAt(tick)
    const step = { x: payload.x, y, facing: FACING.down, drive: NO_DRIVE }
    events.push(session.submit(tick, { type: 'drillStep', payload: step }))
  }
  return events
}

function approachHeightAt(tick: number): number {
  return Math.max(0, APPROACH_MM - APPROACH_MM_PER_TICK * tick)
}

function isStillOre(session: ScriptedSession, tile: TilePoint): boolean {
  return kindOfCell(cellAt(session.state().world, PARAMS, tile)) === CELL_KIND.ore
}

function gatedRun(delta: DevFlagDelta, drive: (session: ScriptedSession) => DomainEvent[][]) {
  return withRegistrations([GATE], () => {
    const session = flaggedSession(delta)
    const events = drive(session)
    return {
      lines: drillGatedAt(events, ORE_TILE).length,
      isStillOre: isStillOre(session, ORE_TILE),
    }
  })
}

describe('the gate under every dev flag combination (ticket 547, HS b)', () => {
  it.each(COMBINATIONS.map((delta) => [nameOf(delta), delta] as const))(
    'stops a held report at the gated cell once, never cutting it (%s off)',
    (_name, delta) => {
      expect(gatedRun(delta, (session) => reportDown(session, () => 0))).toEqual({
        lines: 1,
        isStillOre: true,
      })
    },
  )

  it.each(COMBINATIONS.map((delta) => [nameOf(delta), delta] as const))(
    'stops reports moving down onto the gated cell, never cutting it (%s off)',
    (_name, delta) => {
      const run = gatedRun(delta, (session) => reportDown(session, approachHeightAt))
      expect(run.isStillOre).toBe(true)
      expect(run.lines).toBe(1)
    },
  )

  it.each(COMBINATIONS.map((delta) => [nameOf(delta), delta] as const))(
    "stops the swept cut's steps at the gated cell, never cutting it (%s off)",
    (_name, delta) => {
      const run = gatedRun(delta, stepDown)
      expect(run.isStillOre).toBe(true)
      expect(run.lines).toBeGreaterThan(0)
    },
  )
})
