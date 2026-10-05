/**
 * Draws the active enemies as flat placeholders (#9, #13): silhouette by kind, tint, size and glow
 * by tier (`enemyLookOf`). The authority owns where they are; this reads it every frame into a
 * fixed pool of meshes, one body and one halo per enemy a vehicle may have, so nothing per-frame
 * goes through React or allocates.
 */
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  CircleGeometry,
  MeshBasicMaterial,
  PlaneGeometry,
  type BufferGeometry,
  type Mesh,
} from 'three'
import { MM_PER_METRE } from '../constants/physics'
import { readEnemies } from '../store/gameStore'
import type { Enemy } from '../systems/authority/combat/combatState'
import { ECONOMY } from '../systems/economy/economy'
import { enemyLookOf, type EnemySilhouette } from '../systems/render/enemyPlaceholder'

const SLOTS = ECONOMY.enemies.combat.maxActivePerVehicle
/** In front of the tiles, behind the vehicle's parts; the halo just behind its body. */
const ENEMY_Z = 0.08
const HALO_Z = 0.07
/** The halo reaches this far past the body, as a share of its size. */
const HALO_SPREAD = 1.7
const DISC_SEGMENTS = 24

interface EnemySlot {
  body: Mesh | null
  halo: Mesh | null
}

type Silhouettes = Readonly<Record<EnemySilhouette, BufferGeometry>>

export function EnemyPlaceholders() {
  const slots = useRef<EnemySlot[]>(
    Array.from({ length: SLOTS }, () => ({ body: null, halo: null })),
  )
  const silhouettes = useMemo(createSilhouettes, [])
  const haloGeometry = useMemo(() => new CircleGeometry(0.5, DISC_SEGMENTS), [])
  useFrame(() => placeEnemies(slots.current, readEnemies(), silhouettes))
  return (
    <>
      {slots.current.map((slot, at) => (
        <group key={at}>
          <mesh ref={(mesh) => (slot.halo = mesh)} geometry={haloGeometry} visible={false}>
            <meshBasicMaterial transparent blending={AdditiveBlending} depthWrite={false} />
          </mesh>
          <mesh ref={(mesh) => (slot.body = mesh)} visible={false}>
            <meshBasicMaterial />
          </mesh>
        </group>
      ))}
    </>
  )
}

function createSilhouettes(): Silhouettes {
  return { square: new PlaneGeometry(1, 1), round: new CircleGeometry(0.5, DISC_SEGMENTS) }
}

function placeEnemies(
  slots: readonly EnemySlot[],
  enemies: readonly Enemy[],
  silhouettes: Silhouettes,
): void {
  slots.forEach((slot, at) => showEnemy(slot, enemies[at], silhouettes))
}

function showEnemy(slot: EnemySlot, enemy: Enemy | undefined, silhouettes: Silhouettes): void {
  const { body, halo } = slot
  if (body === null || halo === null) return
  body.visible = enemy !== undefined
  halo.visible = enemy !== undefined
  if (enemy !== undefined) drawEnemy(body, halo, enemy, silhouettes)
}

function drawEnemy(body: Mesh, halo: Mesh, enemy: Enemy, silhouettes: Silhouettes): void {
  const look = enemyLookOf(enemy.kind, enemy.phase, enemy.tier)
  const x = enemy.x / MM_PER_METRE
  const y = enemy.y / MM_PER_METRE
  body.geometry = silhouettes[look.silhouette]
  body.position.set(x, y, ENEMY_Z)
  body.scale.set(look.size, look.size, 1)
  ;(body.material as MeshBasicMaterial).color.setRGB(...look.colour)
  halo.position.set(x, y, HALO_Z)
  halo.scale.setScalar(look.size * HALO_SPREAD)
  const haloMaterial = halo.material as MeshBasicMaterial
  haloMaterial.color.setRGB(...look.colour)
  haloMaterial.opacity = look.glow
}
