/**
 * A rig held by the enemy on its nose (ticket 564, the TD's ruling 3 on #551 6254978633 under the
 * HS's condition 1 6254968595): while an enemy tougher than the rig, or a holder kind, rides the
 * nose (`noseRide.ts`), each of the rig's drill steps cuts nothing. The cursor stays where the cut
 * reached and keeps the work it carries, and only takes the step's position, facing and tick, so
 * the next step's bound is measured from the body and the cut picks up its carry on the tick the
 * enemy dies. In rock the body rides the face (ticket 570), so it waits at the cut.
 *
 * A hold is not a gate: it reports no `DrillGated`, discards no carry and leaves the cut gate as the
 * cursor had it; a gated cell ahead stops the cut on its own, whatever stands in it.
 */
import { digSubStepsAfter, quantumOfCursor, type SweptCut } from '../../vehicle/sweptCut'
import type { VehiclePose } from '../../vehicle/vehiclePose'
import { vehicleOf, withVehicle, type AuthorityState } from '../authorityState'
import { unchanged, type RuleEffect } from '../commandRule'
import { perCellShareAt, sharePassedOf } from '../cutShare'
import { isHoldingRide } from './noseRide'

/** Whether `playerId`'s cut is held this tick: it has cut before, and a holding enemy rides it. */
export function isCutHeld(state: AuthorityState, playerId: string): boolean {
  if (vehicleOf(state, playerId).sweptCut === undefined) return false
  return state.combat.enemies.some(
    (enemy) => enemy.ride?.by === playerId && isHoldingRide(state, enemy),
  )
}

/** A held step: the cursor kept where it reached, at the step's position and tick, nothing cut. */
export function holdTheCut(state: AuthorityState, playerId: string, pose: VehiclePose): RuleEffect {
  const vehicle = vehicleOf(state, playerId)
  const cursor = vehicle.sweptCut as SweptCut
  const held: SweptCut = {
    ...cursor,
    poseXMm: pose.x,
    poseYMm: pose.y,
    facing: pose.facing,
    tick: state.tick,
    cutSharePassed: sharePassedOf(perCellShareAt(state, playerId), 0),
    digSubSteps: digSubStepsAfter(cursor, vehicle.accountedTick, 0, quantumOfCursor(cursor)),
  }
  return unchanged(withVehicle(state, playerId, { ...vehicle, sweptCut: held }))
}
