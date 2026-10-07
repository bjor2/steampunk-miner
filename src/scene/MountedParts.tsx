/**
 * One asset hung at one of the base vehicle's attach points (#235, the #166 seam): a vehicle
 * piece draws its gear with this, so the point comes from the vehicle's sidecar and no offset
 * lives in code (TD acceptance 6 on #166). Drawn in the vehicle's body frame, so it turns and
 * mirrors with the car. The parts render through React because they change only when the piece
 * mounts something else; while on the car they show in `steampunkDebug.vehicleParts().mounted`.
 */
import { useEffect, useMemo } from 'react'
import { atlasMapsOf } from '../systems/art/assetLook'
import { mountedPartQuadsOf, type PartMount } from '../systems/render/mountedPartLook'
import { showMountedParts } from './mountedPartsPresence'
import { PartQuadMesh } from './PartQuadMesh'
import { SHIPPED_ART } from './shippedArt'

/** The body's parts' layer, so the gear's authored draw orders interleave with the body's. */
const MOUNTED_Z = 0.1

export function MountedParts({ assetId, attachId }: PartMount) {
  const quads = useMemo(
    () => mountedPartQuadsOf(SHIPPED_ART, { assetId, attachId }),
    [assetId, attachId],
  )
  const maps = useMemo(() => atlasMapsOf(SHIPPED_ART, assetId), [assetId])
  useEffect(() => showMountedParts({ assetId, attachId }, quads), [assetId, attachId, quads])
  return (
    <>
      {quads.map((quad) => (
        <PartQuadMesh key={quad.partId} quad={quad} maps={maps} baseZ={MOUNTED_Z} />
      ))}
    </>
  )
}
