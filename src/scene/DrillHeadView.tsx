/**
 * The drill head (#7, #13): drawn at its facing in the body's own frame, sweeping between facings
 * over the same `SWIVEL_TICKS` as the logic, so it turns with the body's upright frame and never
 * rotates the body. Its parts (plate, bit, and the tier-3 bore collar) are the `vehicle` sidecar's
 * drill parts at the visual tier, with any a slice swaps in (#180), and another asset's look part
 * standing in a drill slot (ticket 640). Its tip rides the cut's front (`drillHeadReach`, ticket
 * 789). On a rig wider than bare (ticket 913) the head keeps the hull's width scale off its length:
 * it is drawn across its own width at the rig's collider factor and rides the grown face, so the
 * bit matches its hole. Updated on a ref each frame; the head's pose never goes through React state.
 */
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type { Group } from 'three'
import { BODY_ANCHOR_M } from '../constants/scene'
import type { VehicleController } from '../physics/vehicleController'
import { useGameStore } from '../store/gameStore'
import { bodyWidthScaleOf, rideGrownFace, type RigWidth } from '../systems/render/bodyWidthLook'
import { drillHeadReachOf } from '../systems/render/drillHeadReach'
import {
  createDrillHeadPose,
  writeDrillHeadPose,
  type DrillHeadPose,
} from '../systems/render/drillHeadPose'
import { lookPartKeyOf } from '../systems/render/lookPartQuads'
import {
  drillHeadLookQuadsOf,
  drillHeadQuadsOf,
  vehicleAtlasMaps,
} from '../systems/render/vehicleLook'
import { HeldSizeMount } from './HeldSizeMount'
import { LookPartMesh } from './LookPartMesh'
import { PartQuadMesh } from './PartQuadMesh'
import { SHIPPED_ART } from './shippedArt'
import { useSwappedParts } from './useSwappedParts'

/** In front of the body's parts. */
const HEAD_Z = 0.2
const maps = vehicleAtlasMaps(SHIPPED_ART)

interface DrillHeadViewProps {
  controller: VehicleController
  /** The rig the head is drawn on: its own collider's width. */
  rig: RigWidth
}

export function DrillHeadView({ controller, rig }: DrillHeadViewProps) {
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
  const reach = drillHeadReachOf(SHIPPED_ART, visualTier, swapped.partIds)
  const head = useRef<Group>(null)
  const pose = useMemo(createDrillHeadPose, [])
  useFrame(() => {
    writeDrillHeadPose(controller.drillHead(), reach, pose)
    rideGrownFace(pose, rig)
    if (head.current !== null) placeDrillHead(head.current, pose, rig)
  })
  return (
    <HeldSizeMount rig={rig} mountX={BODY_ANCHOR_M.x}>
      <group ref={head}>
        {quads.map((quad) => (
          <PartQuadMesh key={quad.partId} quad={quad} maps={maps} baseZ={0} />
        ))}
        {looks.map((look) => (
          <LookPartMesh key={lookPartKeyOf(look)} look={look} baseZ={0} />
        ))}
      </group>
    </HeldSizeMount>
  )
}

/** At its pose, turned to its aim, and across its own width (local y) at the rig's width scale. */
function placeDrillHead(head: Group, pose: DrillHeadPose, rig: RigWidth): void {
  head.position.set(pose.x, pose.y, HEAD_Z)
  head.rotation.set(0, 0, pose.angle)
  head.scale.y = bodyWidthScaleOf(rig)
}
