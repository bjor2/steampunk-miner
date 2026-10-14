import { describe, expect, it } from 'vitest'
import { CUT_GATE_HOLD_TICKS } from '../../constants/balance'
import { blockHardness } from '../economy/oreEconomy'
import { cutStepMmOf, metresPerSecondOfStep } from '../vehicle/cutSpeed'
import { NO_DRIVE } from '../vehicle/driveSigns'
import { subStepsPerTile } from '../vehicle/drillRule'
import { FACING } from '../vehicle/vehiclePose'
import { statsOfVehicle } from '../vehicle/vehicleState'
import { surfaceRowOfColumn } from '../world/tileGrid'
import { cutFollowAt, type CutFollowStep } from './cutFollowRead'
import { createScriptedSession, PARAMS, poseAbove, type ScriptedSession } from './scriptedSession'

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
})
