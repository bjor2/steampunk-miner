/**
 * The 2D world: an orthographic camera looking down -Z at the XY plane, rolling with the planet
 * (#13). `flat` turns tone mapping off: the flat-vector look writes its colours as they are.
 */
import { Canvas } from '@react-three/fiber'
import { CAMERA_POSITION, CAMERA_ZOOM } from '../constants/scene'
import { PhysicsWorld } from '../physics/PhysicsWorld'
import { PlanetCamera } from './PlanetCamera'
import { PlanetTerrain } from './PlanetTerrain'
import { SkyBackground } from './SkyBackground'
import { Sparks } from './Sparks'
import { Vehicle } from './Vehicle'

export function GameScene() {
  return (
    <Canvas flat orthographic camera={{ zoom: CAMERA_ZOOM, position: [...CAMERA_POSITION] }}>
      <SkyBackground />
      <PlanetCamera />
      <PlanetTerrain />
      <PhysicsWorld>
        <Vehicle />
      </PhysicsWorld>
      <Sparks />
    </Canvas>
  )
}
