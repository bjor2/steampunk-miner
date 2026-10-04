/** A fixed slab of ground. Placeholder until planets (design doc section 7) replace it. */
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import type { ReactNode } from 'react'
import { GROUND_CENTRE_Y, GROUND_HALF_HEIGHT, GROUND_HALF_WIDTH } from '../constants/scene'

export function StaticGround({ children }: { children: ReactNode }) {
  return (
    <RigidBody type="fixed" colliders={false} position={[0, GROUND_CENTRE_Y, 0]}>
      <CuboidCollider args={[GROUND_HALF_WIDTH, GROUND_HALF_HEIGHT, 0.5]} />
      {children}
    </RigidBody>
  )
}
