/**
 * The fixed pool both enemy views draw into: one body and one halo per enemy a vehicle may have
 * (#9: at most 6, plus the tunnel wrecker's own slots, #131), refilled from the authority every frame, so nothing per-frame goes through
 * React or allocates and the draw count never grows (#38). The halo is the tier's glow and the
 * telegraph's flare whatever the body looks like.
 */
import { CircleGeometry, type Mesh, type MeshBasicMaterial } from 'three'
import type { Enemy } from '../systems/authority/combat/combatState'
import { MOST_ENEMIES_PER_VEHICLE } from '../systems/authority/combat/enemyRoster'
import type { EnemyLook } from '../systems/render/enemyPlaceholder'

export const ENEMY_SLOTS = MOST_ENEMIES_PER_VEHICLE
/** In front of the tiles, behind the vehicle's parts; the halo just behind its body. */
export const ENEMY_Z = 0.08
const HALO_Z = 0.07
/** The halo reaches this far past the body, as a share of its size. */
const HALO_SPREAD = 1.7
export const DISC_SEGMENTS = 24

export interface EnemySlot {
  body: Mesh | null
  halo: Mesh | null
}

export type DrawEnemy = (body: Mesh, halo: Mesh, enemy: Enemy) => void

export function createEnemySlots(): EnemySlot[] {
  return Array.from({ length: ENEMY_SLOTS }, () => ({ body: null, halo: null }))
}

export function createHaloGeometry(): CircleGeometry {
  return new CircleGeometry(0.5, DISC_SEGMENTS)
}

/** Shows slot `n` for the `n`th enemy and hides the rest. */
export function fillEnemySlots(
  slots: readonly EnemySlot[],
  enemies: readonly Enemy[],
  draw: DrawEnemy,
): void {
  slots.forEach((slot, at) => showEnemy(slot, enemies[at], draw))
}

function showEnemy(slot: EnemySlot, enemy: Enemy | undefined, draw: DrawEnemy): void {
  const { body, halo } = slot
  if (body === null || halo === null) return
  body.visible = enemy !== undefined
  halo.visible = enemy !== undefined
  if (enemy !== undefined) draw(body, halo, enemy)
}

export function placeHalo(halo: Mesh, x: number, y: number, look: EnemyLook): void {
  halo.position.set(x, y, HALO_Z)
  halo.scale.setScalar(look.size * HALO_SPREAD)
  const material = halo.material as MeshBasicMaterial
  material.color.setRGB(...look.colour)
  material.opacity = look.glow
}
