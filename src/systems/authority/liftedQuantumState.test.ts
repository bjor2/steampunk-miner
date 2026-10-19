import { describe, expect, it } from 'vitest'
import { DRILL_SUBSTEPS_PER_TICK, STEP_BOUND_TOLERANCE_MM } from '../../constants/balance'
import { NO_DRIVE } from '../vehicle/driveSigns'
import { FACING } from '../vehicle/vehiclePose'
import { surfaceRowOfColumn } from '../world/tileGrid'
import { withSweptLawCharge } from './cutCarryFixtures'
import { createScriptedSession, PARAMS, poseAbove, type ScriptedSession } from './scriptedSession'
import { readSnapshot, takeSnapshot } from './sessionSnapshot'
import { stateDigest } from './stateDigest'
import { drillQuantumAt, stepBoundsAt } from './stepBoundRead'

// The lifted sub-step floor in state (ticket 558): a fast rig's swept cut keeps its cursor's dig
// time and carry, and its energy carry, in its own drill quantum, each beside the quantum it counts
// in; a rig at the base quantum leaves both keys out, so its state digests as before.

const COLUMN = 20
const SURFACE_TY = surfaceRowOfColumn(COLUMN, PARAMS.radiusTiles)
const START = { x: COLUMN * 1000 + 500, y: (SURFACE_TY + 3) * 1000 + 500 }
/** Purchase 25 cuts band 1 at about 278 cells/s: its quantum is the base doubled three times (480). */
const FAST_PURCHASE = 25
const BASE_PURCHASE = 12

/** A rig of `purchase` reported over the column facing down, then cutting `ticks` ticks of steps. */
function cutDownWith(purchase: number, ticks: number): ScriptedSession {
  const session = createScriptedSession()
  session.submit(0, {
    type: 'debug.setUpgrade',
    payload: { upgradeId: 'drill_power', level: purchase },
  })
  session.submit(0, { type: 'debug.setEnergy', payload: { energy: '100000' } })
  const { payload } = poseAbove({ tx: 0, ty: 0 }, FACING.down)
  session.submit(0, { type: 'reportPose', payload: { ...payload, ...START } })
  const strideMm = stepBoundsAt(session.state(), 'p1').cuttingMm - STEP_BOUND_TOLERANCE_MM
  for (let tick = 1; tick <= ticks; tick++) {
    const y = START.y - Math.min(strideMm * tick, 20_000)
    session.submit(tick, {
      type: 'drillStep',
      payload: { x: START.x, y, facing: FACING.down, drive: NO_DRIVE },
    })
  }
  return session
}

describe('the drill quantum in state (ticket 558)', () => {
  it('keeps a fast rig cursor and energy carry beside the quantum they count in', () => {
    const session = withSweptLawCharge(true, () => cutDownWith(FAST_PURCHASE, 12))
    const quantum = drillQuantumAt(session.state(), 'p1')
    expect(quantum).toBe(8 * DRILL_SUBSTEPS_PER_TICK)
    expect(session.vehicle().sweptCut?.quantum).toBe(quantum)
    if (session.vehicle().cutEnergyCarry !== undefined) {
      expect(session.vehicle().cutEnergyCarryQuantum).toBe(quantum)
    }
  })

  it('leaves both quantum keys out for a rig at the base quantum', () => {
    const session = withSweptLawCharge(true, () => cutDownWith(BASE_PURCHASE, 12))
    expect(drillQuantumAt(session.state(), 'p1')).toBe(DRILL_SUBSTEPS_PER_TICK)
    expect(session.vehicle().sweptCut).toBeDefined()
    expect(session.vehicle().sweptCut).not.toHaveProperty('quantum')
    expect(session.vehicle()).not.toHaveProperty('cutEnergyCarryQuantum')
  })

  it('restores a snapshot of a fast rig mid-cut to the same digest', () => {
    const session = withSweptLawCharge(true, () => cutDownWith(FAST_PURCHASE, 12))
    const restored = readSnapshot(JSON.parse(JSON.stringify(takeSnapshot(session.state()))))
    expect('state' in restored && stateDigest(restored.state)).toBe(stateDigest(session.state()))
  })

  it('refuses a snapshot whose quantum is not the base doubled, or names a carry it lacks', () => {
    const fast = withSweptLawCharge(true, () => cutDownWith(FAST_PURCHASE, 12))
    const snapshotOf = () => JSON.parse(JSON.stringify(takeSnapshot(fast.state())))
    for (const quantum of [60, 100, 61_440 * 4]) {
      const snapshot = snapshotOf()
      snapshot.state.players.p1.vehicle.sweptCut.quantum = quantum
      expect(readSnapshot(snapshot)).toEqual({ problems: [expect.stringContaining('sweptCut')] })
    }
    const lacking = snapshotOf()
    delete lacking.state.players.p1.vehicle.cutEnergyCarry
    lacking.state.players.p1.vehicle.cutEnergyCarryQuantum = 240
    expect(readSnapshot(lacking)).toEqual({
      problems: [expect.stringContaining('cutEnergyCarryQuantum')],
    })
  })
})
