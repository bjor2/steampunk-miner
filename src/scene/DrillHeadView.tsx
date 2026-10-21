/**
 * The drill head (#7, #13): drawn at its facing in the body's own frame, sweeping between facings
 * over the same `SWIVEL_TICKS` as the logic, so it turns with the body's upright frame and never
 * rotates the body. Its parts (plate, bit, and the tier-3 bore collar) are the `vehicle` sidecar's
 * drill parts at the visual tier, with any a slice swaps in (#180), and another asset's look part
 * standing in a drill slot (ticket 640). Updated on a ref each frame;
 * the head's pose never goes through React state.
 */
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type { Group } from 'three'
import { VEHICLE_COLLIDER_SIZE } from '../constants/physics'
import type { VehicleController } from '../physics/vehicleController'
import { useGameStore } from '../store/gameStore'
import { createDrillHeadPose, writeDrillHeadPose } from '../systems/render/drillHeadPose'
import { lookPartKeyOf } from '../systems/render/lookPartQuads'
import {
  drillHeadLookQuadsOf,
  drillHeadQuadsOf,
  drillHeadSizeOf,
  vehicleAtlasMaps,
} from '../systems/render/vehicleLook'
import { LookPartMesh } from './LookPartMesh'
import { PartQuadMesh } from './PartQuadMesh'
import { SHIPPED_ART } from './shippedArt'
import { useSwappedParts } from './useSwappedParts'

/** In front of the body's parts. */
const HEAD_Z = 0.2
const maps = vehicleAtlasMaps(SHIPPED_ART)

export function DrillHeadView({ controller }: { controller: VehicleController }) {
  const visualTier = useGameStore((state) => state.vehicle.visualTier)
  const swapped = useSwappedParts()
  const quads = useMemo(
    () => drillHeadQuadsOf(SHIPPED_ART, visualTier, swapped.partIds, swapped.looks),
    [visualTier, swapped],
  )
  const looks = useMemo(
    () => drillHeadLookQuadsOf(SHIPPED_ART, visualTier, swapped.partIds, swapped.looks),
    [visualTier, swapped],
  )
  const reach =
    (VEHICLE_COLLIDER_SIZE + drillHeadSizeOf(SHIPPED_ART, visualTier, swapped.partIds)) / 2
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
        <PartQuadMesh key={quad.partId} quad={quad} maps={maps} baseZ={0} />
      ))}
      {looks.map((look) => (
        <LookPartMesh key={lookPartKeyOf(look)} look={look} baseZ={0} />
      ))}
    </group>
  )
}
