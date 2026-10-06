/**
 * The local vehicle: the input intent in, the fixed-step loop, the placeholder art, the drill head
 * the guns' turret once mounted (#107), the charge rack once bolted on (#109), and the heat
 * shimmer above the throttle line (#113).
 */
import { useMemo } from 'react'
import { VehicleBody } from '../physics/VehicleBody'
import type { VehicleController } from '../physics/vehicleController'
import { readLocalVehicle } from '../store/gameStore'
import { readVehicleIntent } from '../store/inputRuntime'
import { DrillHeadView } from './DrillHeadView'
import { VehicleChargeRack } from './VehicleChargeRack'
import { HeatShimmer } from './HeatShimmer'
import { VehicleGuns } from './VehicleGuns'
import { VehiclePlaceholder } from './VehiclePlaceholder'
import { createVehicleLoop } from './vehicleLoop'
import { vehiclePresence } from './vehiclePresence'
import { vehicleStagePresence } from './vehicleStage'

export function Vehicle() {
  const loop = useMemo(createVehicleLoop, [])
  const startPose = useMemo(() => readLocalVehicle().pose, [])
  const stepVehicle = (controller: VehicleController) => loop.step(controller, readVehicleIntent())

  if (startPose === null) return null
  return (
    <VehicleBody
      startPose={startPose}
      onFixedStep={stepVehicle}
      presence={vehiclePresence}
      stage={vehicleStagePresence}
    >
      {(controller) => (
        <>
          <VehiclePlaceholder />
          <DrillHeadView controller={controller} />
          <VehicleGuns />
          <VehicleChargeRack />
          <HeatShimmer />
        </>
      )}
    </VehicleBody>
  )
}
