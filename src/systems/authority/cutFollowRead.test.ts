import { describe, expect, it } from 'vitest'
import { CUT_GATE_HOLD_TICKS } from '../../constants/balance'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { blockHardness } from '../economy/oreEconomy'
import { cutStepMmOf, metresPerSecondOfStep } from '../vehicle/cutSpeed'
import { NO_DRIVE } from '../vehicle/driveSigns'
import { subStepsPerTile } from '../vehicle/drillRule'
import { FACING } from '../vehicle/vehiclePose'
import { statsOfVehicle } from '../vehicle/vehicleState'
import { surfaceRowOfColumn } from '../world/tileGrid'
import { cutFollowAt, type CutFollowStep } from './cutFollowRead'
import {
  createScriptedSession,
  PARAMS,
  poseAbove,
  surfaceOreTiles,
  type ScriptedSession,
} from './scriptedSession'
import { stepBoundsAt } from './stepBoundRead'
import { travelSpeedOf } from '../vehicle/travelParity'
import { vehicleOf } from './authorityState'

// The cut-follow's reads (ticket 333): the gate a drill step leaves on the cursor, and `vCut`.

/** A band-1 column east of the dock; the body rests 0.4 m above the surface row's top. */
const COLUMN = 20
const SURFACE_TY = surfaceRowOfColumn(COLUMN, PARAMS.radiusTiles)
const REST = { x: COLUMN * 1000 + 500, y: (SURFACE_TY + 1) * 1000 + 400 }

function sessionFacingDown(upgrades: Record<string, number> = {}): ScriptedSession {
  const session = createScriptedSession()
  session.submit(0, { type: 'debug.setEnergy', payload: { energy: '150' } })
  for (const [upgradeId, level] of Object.entries(upgrades)) {
    session.submit(0, { type: 'debug.setUpgrade', payload: { upgradeId, level } })
  }
  const { payload } = poseAbove({ tx: 0, ty: 0 }, FACING.down)
  session.submit(0, { type: 'reportPose', payload: { ...payload, x: REST.x, y: REST.y } })
  return session
}

const drillingAt = (y: number): CutFollowStep => ({
  x: REST.x,
  y,
  isLifting: false,
  isDrilling: true,
})

/** Down `mmPerTick` a tick from tick 1: the client's read just before each step, then the step. */
function descendReadingTheGate(session: ScriptedSession, mmPerTick: number, ticks: number) {
  const reads: { client: number; authority: number | undefined }[] = []
  for (let tick = 1; tick <= ticks; tick++) {
    const y = REST.y - mmPerTick * tick
    session.advanceTo(tick)
    const read = cutFollowAt(session.state(), 'p1', drillingAt(y))
    session.submit(tick, { type: 'drillStep', payload: { x: REST.x, y, drive: NO_DRIVE } })
    reads.push({ client: read.gate.cutGate, authority: session.vehicle().sweptCut?.cutGate })
  }
  return reads
}

describe('cut-follow reads (ticket 333)', () => {
  it('opens the gate on the cursor when a drill step meets fresh rock', () => {
    const session = sessionFacingDown()
    session.submit(1, { type: 'drillStep', payload: { x: REST.x, y: REST.y, drive: NO_DRIVE } })
    expect(session.vehicle().sweptCut).toMatchObject({ cutGate: 1, cutGateLowTicks: 0 })
  })

  it('reads before a step the same gate the step leaves on the cursor, every tick', () => {
    const reads = descendReadingTheGate(sessionFacingDown(), 40, 90)
    expect(reads.some((read) => read.client === 1)).toBe(true)
    for (const read of reads) expect(read.client).toBe(read.authority)
  })

  it('sets vCut from the slowest uncut cell of the slab, floor(1000 Q / n) mm a tick', () => {
    const session = sessionFacingDown()
    session.advanceTo(1)
    const { cutSpeed } = cutFollowAt(session.state(), 'p1', drillingAt(REST.y))
    const rock = blockHardness(PARAMS.planetIndex, 1)
    const subSteps = subStepsPerTile(statsOfVehicle(session.vehicle()), rock) as number
    expect(cutSpeed).toBe(metresPerSecondOfStep(cutStepMmOf(subSteps)))
  })

  it('leaves vCut where it is whatever the engine', () => {
    const cutSpeedWith = (engine: number) => {
      const session = sessionFacingDown({ engine })
      session.advanceTo(1)
      return cutFollowAt(session.state(), 'p1', drillingAt(REST.y)).cutSpeed
    }
    expect(cutSpeedWith(400)).toBe(cutSpeedWith(0))
  })

  it('gives no speed while the gate is closed', () => {
    const session = sessionFacingDown()
    session.advanceTo(1)
    const idle = cutFollowAt(session.state(), 'p1', { ...drillingAt(REST.y), isDrilling: false })
    expect(idle).toEqual({
      gate: { cutGate: 0, cutGateLowTicks: CUT_GATE_HOLD_TICKS },
      cutSpeed: 0,
    })
  })

  it('counts the ticks with no step, and the tick read, as ticks under the off line', () => {
    const session = sessionFacingDown()
    session.submit(1, { type: 'drillStep', payload: { x: REST.x, y: REST.y, drive: NO_DRIVE } })
    const idleAt = (tick: number) => {
      session.advanceTo(tick)
      return cutFollowAt(session.state(), 'p1', { ...drillingAt(REST.y), isDrilling: false }).gate
    }
    expect(idleAt(1 + CUT_GATE_HOLD_TICKS - 1)).toEqual({ cutGate: 1, cutGateLowTicks: 5 })
    expect(idleAt(1 + CUT_GATE_HOLD_TICKS).cutGate).toBe(0)
  })

  it('stays closed while the stamp grazes fresh rock beside a carved bore, at the travelling bound', () => {
    // A shaft 1.6 m wide down the column: the 1.9 m stamp's rim grazes fresh rock every tick.
    const session = sessionFacingDown()
    for (let metre = 0; metre <= 12; metre++) {
      const carve = { x: REST.x, y: REST.y - metre * 1000, radius: 800, amount: 255 }
      session.submit(0, { type: 'debug.carveCircle', payload: carve })
    }
    const travelMm = stepBoundsAt(session.state(), 'p1').travellingMm
    const reads = descendReadingTheGate(session, travelMm, 30)
    const cutTicks = session.events().filter((event) => event.type === 'DrillDamageDealt')
    expect(reads.every((read) => read.client === 0 && read.authority === 0)).toBe(true)
    expect(cutTicks.length).toBeGreaterThan(20)
  })
})

// The held cut's reads (ticket 430): an open gate over a slab it has cleared says so, so the motor
// keeps its last vCut there; a shut gate says when a cell the drill may not cut stands in the
// bitten slab, so a coast on the last vCut stops at once at a gated cell.

/** A slice that makes every ore cell dense: a level-0 tip skids on it (tip-locked, #236). */
const DENSE_ORE: SliceDefinition = {
  id: 'gate-probe',
  register: (r) => r.oreDrillClass({ id: 'gate-probe.dense', drillClassOf: () => 'dense' }),
}

const [ORE] = surfaceOreTiles(1)
const ABOVE_ORE = { x: ORE.tx * 1000 + 500, y: (ORE.ty + 1) * 1000 + 500 }
const OVER_ORE: CutFollowStep = { ...ABOVE_ORE, isLifting: false, isDrilling: true }

/** A starting rig (tip 0) facing down over the ore cell; its gate opened on tick 1, then idled. */
function shutOverOre(): ScriptedSession {
  const session = createScriptedSession()
  session.submit(0, { type: 'debug.setEnergy', payload: { energy: '150' } })
  session.submit(0, { type: 'debug.setUpgrade', payload: { upgradeId: 'drill_tip', level: 0 } })
  const { payload } = poseAbove(ORE, FACING.down)
  session.submit(0, { type: 'reportPose', payload: { ...payload, ...ABOVE_ORE } })
  session.submit(1, { type: 'drillStep', payload: { ...ABOVE_ORE, drive: NO_DRIVE } })
  session.advanceTo(2 + CUT_GATE_HOLD_TICKS)
  return session
}

describe('held cut reads (ticket 430)', () => {
  it('says when a shut gate bites on a cell the drill may not cut', () => {
    const read = withRegistrations([DENSE_ORE], () =>
      cutFollowAt(shutOverOre().state(), 'p1', OVER_ORE),
    )
    expect(read.gate.cutGate).toBe(0)
    expect(read.isSpanStopped).toBe(true)
  })

  it('says nothing of a span stop over ground the drill may cut, or with the drill not biting', () => {
    const read = cutFollowAt(shutOverOre().state(), 'p1', OVER_ORE)
    expect(read.gate.cutGate).toBe(0)
    expect(read.isSpanStopped).toBeUndefined()
    const idle = withRegistrations([DENSE_ORE], () =>
      cutFollowAt(shutOverOre().state(), 'p1', { ...OVER_ORE, isDrilling: false }),
    )
    expect(idle.isSpanStopped).toBeUndefined()
  })

  it("says when the open gate has nothing left to cut, its speed then travel's", () => {
    const session = sessionFacingDown()
    session.submit(1, { type: 'drillStep', payload: { x: REST.x, y: REST.y, drive: NO_DRIVE } })
    const carve = { x: REST.x, y: REST.y - 1500, radius: 1500, amount: 255 }
    session.submit(1, { type: 'debug.carveCircle', payload: carve })
    session.advanceTo(2)
    const read = cutFollowAt(session.state(), 'p1', drillingAt(REST.y))
    expect(read.gate.cutGate).toBe(1)
    expect(read.isSlabClear).toBe(true)
    expect(read.cutSpeed).toBe(travelSpeedOf(vehicleOf(session.state(), 'p1'), PARAMS))
  })

  it('never says the slab is clear while it holds ground to cut', () => {
    const session = sessionFacingDown()
    session.advanceTo(1)
    expect(cutFollowAt(session.state(), 'p1', drillingAt(REST.y)).isSlabClear).toBeUndefined()
  })
})
