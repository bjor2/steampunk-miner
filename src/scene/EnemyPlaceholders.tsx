/**
 * Draws the active enemies as flat placeholders (#9, #13): silhouette by kind, tint, size and glow
 * by tier (`enemyLookOf`). The authority owns where they are; this reads it every frame into the
 * fixed enemy pool (`enemyPool`). `EnemyFigures` draws these while the S7c atlases load.
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
import { enemyLookOf, type EnemySilhouette } from '../systems/render/enemyPlaceholder'
import {
  createEnemySlots,
  createHaloGeometry,
  DISC_SEGMENTS,
  ENEMY_Z,
  fillEnemySlots,
  placeHalo,
} from './enemyPool'

type Silhouettes = Readonly<Record<EnemySilhouette, BufferGeometry>>

export function EnemyPlaceholders() {
  const slots = useRef(createEnemySlots())
  const silhouettes = useMemo(createSilhouettes, [])
  const haloGeometry = useMemo(createHaloGeometry, [])
  const draw = useMemo(() => drawEnemyWith(silhouettes), [silhouettes])
  useFrame(() => fillEnemySlots(slots.current, readEnemies(), draw))
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

function drawEnemyWith(silhouettes: Silhouettes) {
  return (body: Mesh, halo: Mesh, enemy: Enemy) => drawEnemy(body, halo, enemy, silhouettes)
}

function drawEnemy(body: Mesh, halo: Mesh, enemy: Enemy, silhouettes: Silhouettes): void {
  const look = enemyLookOf(enemy.kind, enemy.phase, enemy.tier)
  const x = enemy.x / MM_PER_METRE
  const y = enemy.y / MM_PER_METRE
  body.geometry = silhouettes[look.silhouette]
  body.position.set(x, y, ENEMY_Z)
  body.scale.set(look.size, look.size, 1)
  ;(body.material as MeshBasicMaterial).color.setRGB(...look.colour)
  placeHalo(halo, x, y, look)
}
