/** The placeholder vehicle: a copper square (design doc section 9 art comes later). */
import { VehicleBody } from '../physics/VehicleBody'
import { VEHICLE_SIZE } from '../constants/scene'
import { useKeyboardThrottle } from './useKeyboardThrottle'

export function Vehicle() {
  const throttle = useKeyboardThrottle()
  return (
    <VehicleBody throttle={throttle}>
      <mesh>
        <boxGeometry args={[VEHICLE_SIZE, VEHICLE_SIZE, VEHICLE_SIZE]} />
        <meshStandardMaterial color="#b87333" />
      </mesh>
    </VehicleBody>
  )
}
