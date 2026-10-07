/**
 * What the threat periscope warns of (#162 Sensing row, the radius from #162 4.4): every enemy
 * within its radius of the miner, telegraphing or not, with the family's icon, the octant it lies
 * in on the HUD compass and a distance band; a burrower shows as a dust trail before it ever
 * telegraphs. Reveal only (Vertical Scaler on #157): no enemy, aim or motion changes.
 */
import { MM_PER_METRE } from '../../../constants/physics'
import { enemyIconIdOf } from '../../../systems/art/icons/iconSet'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import type { Enemy } from '../../../systems/authority/combat/combatState'
import type { EnemyKind } from '../../../systems/economy/economyDefinition'
import type { VehiclePose } from '../../../systems/vehicle/vehiclePose'
import { localOctantOf } from '../../../systems/views/compass'

/** Inside the first third of the radius, the second, or the last. */
export type DistanceBand = 'near' | 'mid' | 'far'

export interface PeriscopeWarning {
  enemyId: string
  kind: EnemyKind
  iconId: string
  /** 0 local up, then clockwise, as the HUD compass draws it. */
  octant: number
  band: DistanceBand
  /** The burrower's dust trail through the rock (#9: it moves underground). */
  isDustTrail: boolean
}

interface Sighting {
  enemy: Enemy
  dx: number
  dy: number
  distanceSq: number
}

const BAND_THIRDS = 3

/** Every enemy in range, nearest first, then by id; empty with no pose. */
export function periscopeWarningsOf(
  state: AuthorityState,
  playerId: string,
  radiusTiles: number,
): PeriscopeWarning[] {
  const pose = state.players[playerId].vehicle.pose
  if (pose === null) return []
  const radiusMm = radiusTiles * MM_PER_METRE
  return state.combat.enemies
    .map((enemy) => sightingOf(pose, enemy))
    .filter((sighting) => sighting.distanceSq <= radiusMm * radiusMm)
    .sort(compareNearestFirst)
    .map((sighting) => warningOf(pose, sighting, radiusMm))
}

function sightingOf(pose: VehiclePose, enemy: Enemy): Sighting {
  const dx = enemy.x - pose.x
  const dy = enemy.y - pose.y
  return { enemy, dx, dy, distanceSq: dx * dx + dy * dy }
}

function compareNearestFirst(a: Sighting, b: Sighting): number {
  if (a.distanceSq !== b.distanceSq) return a.distanceSq - b.distanceSq
  return a.enemy.id < b.enemy.id ? -1 : 1
}

function warningOf(pose: VehiclePose, sighting: Sighting, radiusMm: number): PeriscopeWarning {
  const { enemy } = sighting
  return {
    enemyId: enemy.id,
    kind: enemy.kind,
    iconId: enemyIconIdOf(enemy.kind),
    octant: localOctantOf(pose, sighting.dx, sighting.dy),
    band: bandOf(sighting.distanceSq, radiusMm),
    isDustTrail: enemy.kind === 'burrower',
  }
}

/** Compared squared, in whole millimetres, so every client bands an enemy alike. */
function bandOf(distanceSq: number, radiusMm: number): DistanceBand {
  const third = Math.floor(radiusMm / BAND_THIRDS)
  if (distanceSq <= third * third) return 'near'
  return distanceSq <= 4 * third * third ? 'mid' : 'far'
}
