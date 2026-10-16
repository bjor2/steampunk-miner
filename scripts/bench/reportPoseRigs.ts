/**
 * The rigs `benchReportPose.ts` cuts with (ticket 514), both on the TD's probe cut: a level cut on
 * planet 1 at about 279.5 m from the centre, starting 10 m west of the dock column. The probe's
 * own rig has the drill far past the floor so every sample the stamp reaches clears (`planetLevel`
 * 1, the "P1 rigs" of the cost gate); the P200 rig has every track at its on-curve level for
 * planet 200 (`planetLevel` 200), the Vertical Scaler's flatness check (TD addendum 6225108027 on
 * #514). Both may step 60.25 m a tick, so at 3600 m/s a W = 7 report carves about 430 cells.
 */
import type { CommandIntent } from '../../src/systems/authority/authorityCommand'
import type { AuthorityState } from '../../src/systems/authority/authorityState'
import {
  createScriptedSession,
  FREEZE_ENEMIES,
  poseAbove,
} from '../../src/systems/authority/scriptedSession'
import { onCurveSteps } from '../../src/systems/economy/vehicleStats'
import { FACING } from '../../src/systems/vehicle/vehiclePose'

export interface BenchRig {
  /** 1 for the probe's rig, 200 for the on-curve planet-200 rig. */
  planetLevel: number
  levels: Readonly<Record<string, number>>
}

/** The body's centre at tick 0, mm, and how far east of it the cut stays under ground. */
export const CUT_START = { x: -10_000, y: 279_500 }
export const CUT_LENGTH_MM = 115_000

/** A full tank whatever the rig's capacity, so no report runs dry mid-leg. */
const FULL_TANK = { type: 'debug.setEnergy', payload: { energy: '1000000000' } } as const

export const PLANET_1_RIG: BenchRig = {
  planetLevel: 1,
  levels: { drill_power: 2000, drill_tip: 600 },
}
export const PLANET_200_RIG: BenchRig = { planetLevel: 200, levels: onCurveSteps(200) }

/** A fresh state with the rig's levels, the body standing at the cut's start facing right. */
export function stateAtCutStart(rig: BenchRig): AuthorityState {
  const session = createScriptedSession()
  for (const intent of levelIntentsOf(rig)) session.submit(0, intent)
  session.submit(0, FREEZE_ENEMIES)
  session.submit(0, FULL_TANK)
  const { payload } = poseAbove({ tx: 0, ty: 0 }, FACING.right)
  session.submit(0, { type: 'reportPose', payload: { ...payload, ...CUT_START } })
  return session.state()
}

function levelIntentsOf(rig: BenchRig): CommandIntent[] {
  return Object.entries(rig.levels).map(([upgradeId, level]) => ({
    type: 'debug.setUpgrade',
    payload: { upgradeId, level },
  }))
}
