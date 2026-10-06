/**
 * The Rapier world on the fixed step. World gravity is zero: gravity on a round planet is radial
 * and applied by the vehicle's motor (#7). Rapier is imported only under src/physics.
 */
import { Physics, useRapier } from '@react-three/rapier'
import { useEffect, type ReactNode } from 'react'
import { PHYSICS_TIMESTEP } from '../constants/physics'
import { watchPhysicsWorld } from './physicsStats'

const NO_WORLD_GRAVITY: [number, number, number] = [0, 0, 0]

/**
 * `isPaused` stops the fixed step: no tick, no motion. The local pause while the settings overlay
 * is open with one human player (#33 section 1), the same mechanism as the debug `pause()`.
 */
export function PhysicsWorld({ children, isPaused }: { children: ReactNode; isPaused: boolean }) {
  return (
    <Physics gravity={NO_WORLD_GRAVITY} timeStep={PHYSICS_TIMESTEP} paused={isPaused}>
      <WorldStatsWatch />
      {children}
    </Physics>
  )
}

/** Lets `getPhysicsStats()` read this world's counts while it runs (#119). */
function WorldStatsWatch() {
  const { world } = useRapier()
  useEffect(() => watchPhysicsWorld(world), [world])
  return null
}
