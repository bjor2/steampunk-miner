import { GROUND_HALF_HEIGHT, GROUND_HALF_WIDTH } from '../constants/scene'
import { StaticGround } from '../physics/StaticGround'

export function Ground() {
  return (
    <StaticGround>
      <mesh>
        <boxGeometry args={[GROUND_HALF_WIDTH * 2, GROUND_HALF_HEIGHT * 2, 1]} />
        <meshStandardMaterial color="#4a3b2f" />
      </mesh>
    </StaticGround>
  )
}
