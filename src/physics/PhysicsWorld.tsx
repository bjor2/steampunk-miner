/** The Rapier world: fixed step, placeholder gravity. Rapier is imported only under src/physics. */
import { Physics } from '@react-three/rapier'
import type { ReactNode } from 'react'
import { PHYSICS_TIMESTEP, PLACEHOLDER_GRAVITY_Y } from '../constants/physics'

export function PhysicsWorld({ children }: { children: ReactNode }) {
  return (
    <Physics gravity={[0, PLACEHOLDER_GRAVITY_Y, 0]} timeStep={PHYSICS_TIMESTEP}>
      {children}
    </Physics>
  )
}
