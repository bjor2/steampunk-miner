/**
 * Which enemies the fire director ranks first (ticket 382, the TD's Q3 definitions on #319), each
 * an O(1) read of one enemy against the rig:
 *
 * - latched: committed to an attack (`windup` or `lunge`) and within its contact reach of the hull;
 *   a `pinned` enemy is left out, as it sits in the front cone the guns never fire into;
 * - rear attacker: winding up, lunging or closing in (`approach`), from the rear zone of the #9
 *   contact rule (`hitArc.ts`), where its hit lands 2x.
 */
import { isTouching } from './combatGeometry'
import type { Enemy, EnemyPhase } from './combatState'
import { hitArcOf } from './hitArc'
import type { VehicleTarget } from './vehicleTarget'

const COMMITTED_PHASES: readonly EnemyPhase[] = ['windup', 'lunge']
const ATTACKING_PHASES: readonly EnemyPhase[] = ['approach', 'windup', 'lunge']

export function isLatched(target: VehicleTarget, enemy: Enemy): boolean {
  return COMMITTED_PHASES.includes(enemy.phase) && isTouching(target.position, enemy)
}

export function isRearAttacker(target: VehicleTarget, enemy: Enemy): boolean {
  const { pose, position } = target
  return (
    ATTACKING_PHASES.includes(enemy.phase) &&
    hitArcOf(pose, enemy.x - position.x, enemy.y - position.y) === 'rear'
  )
}
