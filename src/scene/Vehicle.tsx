/** The local vehicle: keyboard intent in, the fixed-step loop, the placeholder body and drill head. */
import { useMemo } from 'react'
import { VEHICLE_COLOUR } from '../constants/scene'
import { VEHICLE_COLLIDER_SIZE } from '../constants/physics'
import { VehicleBody } from '../physics/VehicleBody'
import type { VehicleController } from '../physics/vehicleController'
import { readLocalVehicle } from '../store/gameStore'
import { DrillHeadView } from './DrillHeadView'
import { useKeyboardIntent } from './useKeyboardIntent'
import { createVehicleLoop } from './vehicleLoop'
import { vehiclePresence } from './vehiclePresence'

export function Vehicle() {
  const intent = useKeyboardIntent()
  const loop = useMemo(createVehicleLoop, [])
  const startPose = useMemo(() => readLocalVehicle().pose, [])
  const stepVehicle = (controller: VehicleController) => loop.step(controller, intent.current)

  if (startPose === null) return null
  return (
    <VehicleBody startPose={startPose} onFixedStep={stepVehicle} presence={vehiclePresence}>
      {(controller) => (
        <>
          <mesh>
            <boxGeometry
              args={[VEHICLE_COLLIDER_SIZE, VEHICLE_COLLIDER_SIZE, VEHICLE_COLLIDER_SIZE]}
            />
            <meshStandardMaterial color={VEHICLE_COLOUR} />
          </mesh>
          <DrillHeadView controller={controller} />
        </>
      )}
    </VehicleBody>
  )
}
