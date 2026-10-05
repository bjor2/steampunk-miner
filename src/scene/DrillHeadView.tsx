/**
 * The drill head (#7, #13): drawn at its facing in the body's own frame, sweeping between facings
 * over the same `SWIVEL_TICKS` as the logic, so it turns with the body's upright frame and never
 * rotates the body. Its plate and bore collar come from the visual tier. Updated on a ref each
 * frame; the head's pose never goes through React state.
 */
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type { Group } from 'three'
import { VEHICLE_COLLIDER_SIZE } from '../constants/physics'
import type { VehicleController } from '../physics/vehicleController'
import { useGameStore } from '../store/gameStore'
import { createDrillHeadPose, writeDrillHeadPose } from '../systems/render/drillHeadPose'
import { drillHeadLookOf } from '../systems/render/vehiclePlaceholder'

/** In front of the placeholder's layers; the collar just behind the bit. */
const HEAD_Z = 0.2
const COLLAR_Z = -0.01
const COLLAR_COLOUR = '#c9a24b'
const COLLAR_SEGMENTS = 20

export function DrillHeadView({ controller }: { controller: VehicleController }) {
  const visualTier = useGameStore((state) => state.vehicle.visualTier)
  const look = drillHeadLookOf(visualTier)
  const reach = (VEHICLE_COLLIDER_SIZE + look.size) / 2
  const head = useRef<Group>(null)
  const pose = useMemo(createDrillHeadPose, [])
  useFrame(() => {
    writeDrillHeadPose(controller.drillHead(), reach, pose)
    head.current?.position.set(pose.x, pose.y, HEAD_Z)
    head.current?.rotation.set(0, 0, pose.angle)
  })
  return (
    <group ref={head}>
      {look.collarSize > 0 && (
        <mesh position={[0, 0, COLLAR_Z]}>
          <circleGeometry args={[look.collarSize / 2, COLLAR_SEGMENTS]} />
          <meshBasicMaterial color={COLLAR_COLOUR} />
        </mesh>
      )}
      <mesh>
        <planeGeometry args={[look.size, look.size]} />
        <meshBasicMaterial color={look.colour} />
      </mesh>
    </group>
  )
}
