/**
 * The drill head (#7, #13): drawn at its facing in the body's own frame, sweeping between facings
 * over the same `SWIVEL_TICKS` as the logic, so it turns with the body's upright frame and never
 * rotates the body. Its parts (plate, bit, and the tier-3 bore collar) are the `vehicle` sidecar's
 * drill parts at the visual tier. Updated on a ref each frame; the head's pose never goes through
 * React state.
 */
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type { Group } from 'three'
import { VEHICLE_COLLIDER_SIZE } from '../constants/physics'
import type { VehicleController } from '../physics/vehicleController'
import { useGameStore } from '../store/gameStore'
import { createDrillHeadPose, writeDrillHeadPose } from '../systems/render/drillHeadPose'
import { drillHeadQuadsOf, drillHeadSizeOf } from '../systems/render/vehicleLook'
import { PlaceholderQuadMesh } from './PlaceholderQuadMesh'

/** In front of the body's parts. */
const HEAD_Z = 0.2

export function DrillHeadView({ controller }: { controller: VehicleController }) {
  const visualTier = useGameStore((state) => state.vehicle.visualTier)
  const quads = useMemo(() => drillHeadQuadsOf(visualTier), [visualTier])
  const reach = (VEHICLE_COLLIDER_SIZE + drillHeadSizeOf(visualTier)) / 2
  const head = useRef<Group>(null)
  const pose = useMemo(createDrillHeadPose, [])
  useFrame(() => {
    writeDrillHeadPose(controller.drillHead(), reach, pose)
    head.current?.position.set(pose.x, pose.y, HEAD_Z)
    head.current?.rotation.set(0, 0, pose.angle)
  })
  return (
    <group ref={head}>
      {quads.map((quad) => (
        <PlaceholderQuadMesh key={quad.partId} quad={quad} baseZ={0} />
      ))}
    </group>
  )
}
