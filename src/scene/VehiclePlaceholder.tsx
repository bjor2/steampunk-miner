/**
 * The run vehicle's body parts (#52, #51), drawn from the `vehicle` placeholder sidecar at the
 * authority replica's visual tier (#7: derived from the levels, never decided here), so an upgrade
 * threshold shows on the vehicle (37.7). Drawn inside the vehicle's body group, so it turns with
 * the body; the drill head's parts are `DrillHeadView`'s.
 */
import { useMemo } from 'react'
import { useGameStore } from '../store/gameStore'
import { vehicleBodyQuadsOf } from '../systems/render/vehicleLook'
import { PlaceholderQuadMesh } from './PlaceholderQuadMesh'

/** Parts sit just in front of the tiles. */
const BODY_Z = 0.1

export function VehiclePlaceholder() {
  const visualTier = useGameStore((state) => state.vehicle.visualTier)
  const quads = useMemo(() => vehicleBodyQuadsOf(visualTier), [visualTier])
  return (
    <>
      {quads.map((quad) => (
        <PlaceholderQuadMesh key={quad.partId} quad={quad} baseZ={BODY_Z} />
      ))}
    </>
  )
}
