/**
 * The 2D world: an orthographic camera looking down -Z at the XY plane, rolling with the planet
 * (#13). `flat` turns tone mapping off: the flat-vector look writes its colours as they are.
 */
import { Canvas } from '@react-three/fiber'
import { CAMERA_POSITION, CAMERA_ZOOM } from '../constants/scene'
import { PhysicsWorld } from '../physics/PhysicsWorld'
import { useGameStore } from '../store/gameStore'
import { EnemyPlaceholders } from './EnemyPlaceholders'
import { PlanetCamera } from './PlanetCamera'
import { PlanetTerrain } from './PlanetTerrain'
import { SkyBackground } from './SkyBackground'
import { Sparks } from './Sparks'
import { Vehicle } from './Vehicle'

export function GameScene() {
  // One human player in the slice, so settings pause the local game (#33); never a command.
  const isPaused = useGameStore((state) => state.isSettingsOpen)
  return (
    <Canvas flat orthographic camera={{ zoom: CAMERA_ZOOM, position: [...CAMERA_POSITION] }}>
      <SkyBackground />
      <PlanetCamera />
      <PlanetTerrain />
      <EnemyPlaceholders />
      <PhysicsWorld isPaused={isPaused}>
        <Vehicle />
      </PhysicsWorld>
      <Sparks />
    </Canvas>
  )
}
