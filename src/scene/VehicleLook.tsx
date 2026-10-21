/**
 * The slices' looks on the local vehicle (ticket 389, `vehicleLooks`): wraps every part drawn in
 * the vehicle's body frame, paints them each frame with the look the slices ask for now (a tint, a
 * see-through body, a glow on named part slots), and draws the single outline round the body that
 * a look asks for or that reduced effects put in place of the tint and the see-through body (G&V
 * on #261). The flashes start from the store's event batches. Nothing here goes through React
 * per frame: the look is a presence record and the paint writes on refs.
 */
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { MeshBasicMaterial, type Group } from 'three'
import {
  VEHICLE_LOOK_FRAME_PRIORITY,
  VEHICLE_OUTLINE_MARGIN_M,
  VEHICLE_OUTLINE_Z,
} from '../constants/scene'
import { listenForDomainEvents } from '../store/domainEventBroadcast'
import { useGameStore } from '../store/gameStore'
import type { AssetQuad } from '../systems/art/assetLook'
import { lookBodyQuadsOf } from '../systems/render/lookPartQuads'
import { vehicleBodyQuadsOf } from '../systems/render/vehicleLook'
import { useDisposeOnRelease } from './disposeOnRelease'
import { SHIPPED_ART } from './shippedArt'
import { useSwappedParts, type SwappedParts } from './useSwappedParts'
import { paintVehicleLook, showVehicleOutline } from './vehicleLookPaint'
import { drawVehicleLookNow, followLookFlashes } from './vehicleLookPresence'

export function VehicleLook({ children }: { children: ReactNode }) {
  const parts = useRef<Group>(null)
  const outline = useRef<Group>(null)
  const outlineMaterial = useMemo(() => new MeshBasicMaterial({ depthWrite: false }), [])
  useDisposeOnRelease(outlineMaterial)
  useEffect(() => listenForDomainEvents(followLookFlashes), [])
  useFrame(() => {
    const look = drawVehicleLookNow()
    paintVehicleLook(parts.current, look)
    showVehicleOutline(outline.current, outlineMaterial, look)
  }, VEHICLE_LOOK_FRAME_PRIORITY)
  return (
    <>
      <group ref={parts}>{children}</group>
      <group ref={outline} visible={false}>
        <BodyOutline material={outlineMaterial} />
      </group>
    </>
  )
}

/** Each body part's frame, a margin past its edges, behind the body: together one outline. */
function BodyOutline({ material }: { material: MeshBasicMaterial }) {
  const visualTier = useGameStore((state) => state.vehicle.visualTier)
  const swapped = useSwappedParts()
  const quads = useMemo(() => outlinedQuadsOf(visualTier, swapped), [visualTier, swapped])
  return (
    <>
      {quads.map((quad) => (
        <mesh
          key={quad.partId}
          position={[quad.centre[0], quad.centre[1], VEHICLE_OUTLINE_Z]}
          material={material}
        >
          <planeGeometry args={outlineSizeOf(quad)} />
        </mesh>
      ))}
    </>
  )
}

/** The body's parts and the look parts standing on it. */
function outlinedQuadsOf(visualTier: number, swapped: SwappedParts): AssetQuad[] {
  return [
    ...vehicleBodyQuadsOf(SHIPPED_ART, visualTier, swapped.partIds, swapped.looks),
    ...lookBodyQuadsOf(SHIPPED_ART, swapped.looks).map((look) => look.quad),
  ]
}

function outlineSizeOf(quad: AssetQuad): [number, number] {
  return [quad.size[0] + 2 * VEHICLE_OUTLINE_MARGIN_M, quad.size[1] + 2 * VEHICLE_OUTLINE_MARGIN_M]
}
