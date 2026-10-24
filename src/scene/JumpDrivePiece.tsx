/**
 * The jump drive on the car (ticket 759; the GD lock on #650: the jump drive has "a visible part on
 * the rig"): the kernel piece that stands the drive's mast (`vehicle-jump-drive`) on the coal
 * tender's frame at the wagon hitch, the point the vehicle's sidecar places, once the drive is
 * bought. It changes only when the drive is fitted, so it renders through React; just over the
 * tender (0.04), under the dynamite rack (0.06) and the body's parts (0.1); listed in
 * `steampunkDebug.vehicleParts().mounted` while on the car.
 */
import { useEffect, useMemo } from 'react'
import { JUMP_DRIVE_ASSET_ID, JUMP_DRIVE_ATTACH_ID } from '../systems/art/jumpDriveArt'
import { atlasMapsOf, type AssetQuad } from '../systems/art/assetLook'
import { mountedPartQuadsOf, type PartMount } from '../systems/render/mountedPartLook'
import { useGameStore } from '../store/gameStore'
import { showMountedParts } from './mountedPartsPresence'
import { PartQuadMesh } from './PartQuadMesh'
import { SHIPPED_ART } from './shippedArt'

/** Between the tender (0.04) and the dynamite rack (0.06), written as a ratio (economy scan). */
const DRIVE_Z = 1 / 20
const MOUNT: PartMount = { assetId: JUMP_DRIVE_ASSET_ID, attachId: JUMP_DRIVE_ATTACH_ID }
const maps = atlasMapsOf(SHIPPED_ART, JUMP_DRIVE_ASSET_ID)

export function JumpDrivePiece() {
  const hasJumpDrive = useGameStore((state) => state.vehicle.hasJumpDrive)
  const quads = useMemo(() => driveQuadsOf(hasJumpDrive), [hasJumpDrive])
  useEffect(() => showMountedParts(MOUNT, quads), [quads])
  return (
    <>
      {quads.map((quad) => (
        <PartQuadMesh key={quad.partId} quad={quad} maps={maps} baseZ={DRIVE_Z} />
      ))}
    </>
  )
}

/** The drive's part in the vehicle's frame at the hitch, or nothing before it is bought. */
function driveQuadsOf(hasJumpDrive: boolean): AssetQuad[] {
  return hasJumpDrive ? mountedPartQuadsOf(SHIPPED_ART, MOUNT) : []
}
