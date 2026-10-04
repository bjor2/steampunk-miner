/** The 2D world: an orthographic camera looking down -Z at the XY plane. */
import { Canvas } from '@react-three/fiber'
import { CAMERA_POSITION, CAMERA_ZOOM } from '../constants/scene'
import { PhysicsWorld } from '../physics/PhysicsWorld'
import { Ground } from './Ground'
import { Vehicle } from './Vehicle'

export function GameScene() {
  return (
    <Canvas orthographic camera={{ zoom: CAMERA_ZOOM, position: [...CAMERA_POSITION] }}>
      <color attach="background" args={['#1b1613']} />
      <ambientLight intensity={0.8} />
      <directionalLight position={[3, 6, 10]} intensity={1.2} />
      <PhysicsWorld>
        <Ground />
        <Vehicle />
      </PhysicsWorld>
    </Canvas>
  )
}
