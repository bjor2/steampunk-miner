/**
 * What a pose report tells combat (#9 "Authority resolution from reported poses"): extrapolation
 * restarts from the report's tick, and the report remembers which of the vehicle's enemies were in
 * its front zone then. The report before it is kept too: a hit that comes soon after either one
 * counts as front for those enemies (`enemyHits.ts`).
 */
import { isWithinZoneTestRange, type VehiclePose } from '../../vehicle/vehiclePose'
import { vehicleOf, withCombat, type AuthorityState } from '../authorityState'
import { unchanged, type RuleEffect } from '../commandRule'
import { combatVehicleOf, enemiesOwnedBy, withCombatVehicle, type Enemy } from './combatState'
import { hitArcOf } from './hitArc'

export function noteReportForCombat(
  state: AuthorityState,
  playerId: string,
  tick: number,
): RuleEffect {
  const { pose } = vehicleOf(state, playerId)
  if (pose === null) return unchanged(state)
  const previous = combatVehicleOf(state.combat, playerId)
  const combat = withCombatVehicle(state.combat, playerId, {
    reportTick: tick,
    frontAtReport: enemiesInFrontOf(pose, enemiesOwnedBy(state.combat, playerId)),
    previousReportTick: previous.reportTick,
    frontAtPreviousReport: previous.frontAtReport,
  })
  return unchanged(withCombat(state, combat))
}

function enemiesInFrontOf(pose: VehiclePose, enemies: readonly Enemy[]): string[] {
  return enemies.filter((enemy) => isInFrontZone(pose, enemy)).map((enemy) => enemy.id)
}

function isInFrontZone(pose: VehiclePose, enemy: Enemy): boolean {
  const dx = enemy.x - pose.x
  const dy = enemy.y - pose.y
  return isWithinZoneTestRange(dx, dy) && hitArcOf(pose, dx, dy) === 'front'
}
