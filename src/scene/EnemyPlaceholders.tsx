/**
 * Draws the active enemies as flat placeholders (#9, #13; the real art and tier tint are #28).
 * The authority owns where they are; this reads it every frame into a fixed pool of meshes, one
 * per enemy a vehicle may have, so nothing per-frame goes through React or allocates.
 */
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Color, type Mesh, type MeshBasicMaterial } from 'three'
import { MM_PER_METRE } from '../constants/physics'
import { readEnemies } from '../store/gameStore'
import type { Enemy } from '../systems/authority/combat/combatState'
import { ECONOMY } from '../systems/economy/economy'
import { enemyLookOf } from '../systems/render/enemyPlaceholder'

const SLOTS = ECONOMY.enemies.combat.maxActivePerVehicle
/** In front of the tiles, behind the vehicle's parts. */
const ENEMY_Z = 0.08

export function EnemyPlaceholders() {
  const meshes = useRef<(Mesh | null)[]>([])
  const colours = useMemo(() => new Map<string, Color>(), [])
  useFrame(() => placeEnemies(meshes.current, readEnemies(), colours))
  return (
    <>
      {Array.from({ length: SLOTS }, (_, slot) => (
        <mesh key={slot} ref={(mesh) => (meshes.current[slot] = mesh)} visible={false}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial />
        </mesh>
      ))}
    </>
  )
}

function placeEnemies(
  meshes: readonly (Mesh | null)[],
  enemies: readonly Enemy[],
  colours: Map<string, Color>,
): void {
  meshes.forEach((mesh, slot) => {
    if (mesh !== null) showEnemy(mesh, enemies[slot], colours)
  })
}

function showEnemy(mesh: Mesh, enemy: Enemy | undefined, colours: Map<string, Color>): void {
  mesh.visible = enemy !== undefined
  if (enemy === undefined) return
  const look = enemyLookOf(enemy.kind, enemy.phase)
  mesh.position.set(enemy.x / MM_PER_METRE, enemy.y / MM_PER_METRE, ENEMY_Z)
  mesh.scale.set(look.size, look.size, 1)
  ;(mesh.material as MeshBasicMaterial).color.copy(colourOf(look.colour, colours))
}

/** One Color per distinct look, made once, so a frame only copies. */
function colourOf(hex: string, colours: Map<string, Color>): Color {
  const known = colours.get(hex)
  if (known !== undefined) return known
  const made = new Color(hex)
  colours.set(hex, made)
  return made
}
