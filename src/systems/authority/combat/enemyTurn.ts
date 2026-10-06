/**
 * What one enemy's tick works with (decision #9), shared by the hunters' phases
 * (`enemyBehaviour.ts`) and the tunnel wrecker's (`wreckerBehaviour.ts`, #111): the state, the
 * enemy, the vehicle it belongs to as it stands at the tick, and the ground it moves through.
 */
import { withCombat, type AuthorityState } from '../authorityState'
import { unchanged, type RuleEffect } from '../commandRule'
import { withEnemy, type Enemy } from './combatState'
import type { Terrain } from './enemyMovement'
import type { VehicleTarget } from './vehicleTarget'

export interface EnemyTurn {
  state: AuthorityState
  enemy: Enemy
  target: VehicleTarget
  terrain: Terrain
  tick: number
}

export type PhaseStep = (turn: EnemyTurn) => RuleEffect

/** The state with this enemy as it now is; nothing to say. */
export function updated(state: AuthorityState, enemy: Enemy): RuleEffect {
  return unchanged(withCombat(state, withEnemy(state.combat, enemy)))
}

export function ticksInPhase(enemy: Enemy, tick: number): number {
  return tick - enemy.phaseSinceTick
}
