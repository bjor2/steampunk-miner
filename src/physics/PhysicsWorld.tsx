/**
 * The Rapier world on the fixed step. World gravity is zero: gravity on a round planet is radial
 * and applied by the vehicle's motor (#7). Rapier is imported only under src/physics.
 *
 * `@react-three/rapier`'s own stepper is held paused and its mesh interpolation off: the game's
 * bodies are plain Rapier bodies it never draws, so `FixedStepDriver` steps the world on the
 * game's clock and hands the bodies the share to draw them between steps.
 */
import { Physics, useRapier } from '@react-three/rapier'
import { useEffect, type ReactNode } from 'react'
import { PHYSICS_TIMESTEP } from '../constants/physics'
import { FixedStepDriver } from './FixedStepDriver'
import { watchPhysicsWorld } from './physicsStats'

const NO_WORLD_GRAVITY: [number, number, number] = [0, 0, 0]

/**
 * `isHeld` stops the fixed step while it answers true: no tick, no motion. The local pause while
 * the settings overlay is open with one human player (#33 section 1), a scenario waiting for play
 * and the debug `pause()` (ticket 301) all hold it this way.
 */
export function PhysicsWorld({ children, isHeld }: { children: ReactNode; isHeld: () => boolean }) {
  return (
    <Physics gravity={NO_WORLD_GRAVITY} timeStep={PHYSICS_TIMESTEP} paused interpolate={false}>
      <WorldStatsWatch />
      <FixedStepDriver isHeld={isHeld} />
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
