/**
 * The run vehicle's body parts (#52, #51), drawn from the `vehicle` asset's sidecar at the
 * authority replica's visual tier (#7: derived from the levels, never decided here), so an upgrade
 * threshold shows on the vehicle (37.7). Drawn inside the vehicle's body group, so it turns with
 * the body; the drill head's parts are `DrillHeadView`'s. Each part moves as the game state
 * drives it (#48); a hit recoils the body.
 */
import { useEffect, useMemo } from 'react'
import { listenForFeedback } from '../store/feedbackBroadcast'
import { useGameStore } from '../store/gameStore'
import type { FeedbackCue } from '../systems/feedback/feedbackCues'
import { vehicleAtlasMaps, vehicleBodyQuadsOf } from '../systems/render/vehicleLook'
import { recoilVehicleParts } from './partMotionPresence'
import { PartQuadMesh } from './PartQuadMesh'
import { SHIPPED_ART } from './shippedArt'

/** Parts sit just in front of the tiles. */
const BODY_Z = 0.1
const maps = vehicleAtlasMaps(SHIPPED_ART)

export function VehiclePlaceholder() {
  const visualTier = useGameStore((state) => state.vehicle.visualTier)
  const quads = useMemo(() => vehicleBodyQuadsOf(SHIPPED_ART, visualTier), [visualTier])
  useEffect(() => listenForFeedback(recoilOnHit), [])
  return (
    <>
      {quads.map((quad) => (
        <PartQuadMesh key={quad.partId} quad={quad} maps={maps} baseZ={BODY_Z} />
      ))}
    </>
  )
}

/** #48: the chassis recoils on hits. */
function recoilOnHit(cue: FeedbackCue): void {
  if (cue.kind === 'hit') recoilVehicleParts()
}
