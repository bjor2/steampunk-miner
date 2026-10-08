/**
 * The world root (ticket 339): everything placed in planet metres hangs under one group set at
 * minus the render origin each frame, and the camera is placed relative to the same origin, so the
 * matrices three hands the GPU stay within about 1.5 km of zero at any planet radius. Children keep
 * their planet positions (doubles on the CPU), so a moved origin moves this one group and rebuilds
 * nothing. Pools that write f32 positions themselves (sparks, cement) sit outside it, render-local.
 */
import { useFrame } from '@react-three/fiber'
import { useRef, type ReactNode } from 'react'
import type { Group } from 'three'
import { renderOriginPresence } from './renderOriginPresence'

export function WorldRoot({ children }: { children: ReactNode }) {
  const root = useRef<Group>(null)
  useFrame(() => placeAtRenderOrigin(root.current))
  return <group ref={root}>{children}</group>
}

function placeAtRenderOrigin(root: Group | null): void {
  root?.position.set(-renderOriginPresence.x, -renderOriginPresence.y, 0)
}
