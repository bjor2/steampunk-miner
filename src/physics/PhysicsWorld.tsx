/**
 * The Rapier world on the fixed step. World gravity is zero: gravity on a round planet is radial
 * and applied by the vehicle's motor (#7). Rapier is imported only under src/physics.
 */
import { Physics } from '@react-three/rapier'
import type { ReactNode } from 'react'
import { PHYSICS_TIMESTEP } from '../constants/physics'

const NO_WORLD_GRAVITY: [number, number, number] = [0, 0, 0]

export function PhysicsWorld({ children }: { children: ReactNode }) {
  return (
    <Physics gravity={NO_WORLD_GRAVITY} timeStep={PHYSICS_TIMESTEP}>
      {children}
    </Physics>
  )
}
