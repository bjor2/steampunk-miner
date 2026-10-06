/**
 * Enemy telegraphs on the HUD (#33 section 5, #9 "Telegraph"): one marker per enemy of this
 * vehicle that is winding up, lunging or pinned on the drill, at most one per enemy it may have.
 * Each marker says where it is (the local octant), how long the wind-up still runs, and the arc
 * the hit would land in, from the same pure `hitArcOf` the authority uses. Idle, approaching and
 * recoiling enemies are not telegraphed.
 */
import { enemyIconIdOf } from '../art/icons/iconSet'
import type { AuthorityState } from '../authority/authorityState'
import { enemiesOwnedBy, type Enemy, type EnemyPhase } from '../authority/combat/combatState'
import { MOST_ENEMIES_PER_VEHICLE } from '../authority/combat/enemyRoster'
import { hitArcOf, type HitArc } from '../authority/combat/hitArc'
import type { EnemyKind } from '../economy/economyDefinition'
import { enemyBoundedStats } from '../economy/enemyStats'
import type { VehiclePose } from '../vehicle/vehiclePose'
import { localOctantOf } from './compass'

/** `F`, `S` or `R`: the letter keeps the arc readable without colour (#33 section 7). */
export type ArcLetter = 'F' | 'S' | 'R'

export interface ThreatMarker {
  kind: EnemyKind
  /** The enemy family's icon on the arrow (#158), so the kind reads without colour. */
  iconId: string
  phase: EnemyPhase
  octant: number
  arc: ArcLetter
  /** Ticks of wind-up left; 0 once the lunge started. */
  ticksLeft: number
  /** The burrower's tremor icon (#9: it telegraphs through the ground). */
  isTremor: boolean
}

const TELEGRAPHED_PHASES: readonly EnemyPhase[] = ['windup', 'lunge', 'pinned']

const LETTER_OF_ARC: Readonly<Record<HitArc, ArcLetter>> = { front: 'F', side: 'S', rear: 'R' }

export function threatMarkersOf(state: AuthorityState, playerId: string): ThreatMarker[] {
  const pose = state.players[playerId].vehicle.pose
  if (pose === null) return []
  return enemiesOwnedBy(state.combat, playerId)
    .filter((enemy) => TELEGRAPHED_PHASES.includes(enemy.phase))
    .slice(0, MOST_ENEMIES_PER_VEHICLE)
    .map((enemy) => threatMarkerOf(enemy, pose, state.tick))
}

function threatMarkerOf(enemy: Enemy, pose: VehiclePose, tick: number): ThreatMarker {
  const dx = enemy.x - pose.x
  const dy = enemy.y - pose.y
  return {
    kind: enemy.kind,
    iconId: enemyIconIdOf(enemy.kind),
    phase: enemy.phase,
    octant: localOctantOf(pose, dx, dy),
    arc: LETTER_OF_ARC[hitArcOf(pose, dx, dy)],
    ticksLeft: windupTicksLeft(enemy, tick),
    isTremor: enemy.kind === 'burrower',
  }
}

function windupTicksLeft(enemy: Enemy, tick: number): number {
  if (enemy.phase !== 'windup') return 0
  const { windupTicks } = enemyBoundedStats(enemy.kind, enemy.tier)
  return Math.max(0, windupTicks - (tick - enemy.phaseSinceTick))
}
