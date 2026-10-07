/**
 * The #166 gear on the car (ticket 250): a vehicle piece (#235) that hangs every registered item
 * the loadout mounts at its attach point, posed (extractors folded until 148b drives them) and
 * mirrored where the art says, with a brass Mark plate under each cradle that holds a Mark-bearing
 * item. It changes only when the loadout does, so it renders through React; each asset shows in
 * `steampunkDebug.vehicleParts().mounted` while it is on the car. With no items, it draws nothing.
 */
import { useEffect, useMemo } from 'react'
import { PartQuadMesh } from '../../../scene/PartQuadMesh'
import { showMountedParts } from '../../../scene/mountedPartsPresence'
import { SHIPPED_ART } from '../../../scene/shippedArt'
import { useGameStore } from '../../../store/gameStore'
import { atlasMapsOf, type AtlasMaps } from '../../../systems/art/assetLook'
import { readRigKey, rigItemsOfKey, rigSightOfItems } from '../store/rigReads'
import { pivotedQuadOf, type RigMount } from '../systems/render/rigGear'
import type { GearQuad } from '../systems/render/techGearQuads'
import { MarkPlateMesh } from './MarkPlateMesh'

export const RIG_GEAR_PIECE_ID = 'tech-tree.rig-gear'

/** The body's parts' layer, as `MountedParts` hangs gear: authored draw orders interleave. */
const RIG_Z = 0.1

export function RigGearPiece() {
  const rigKey = useGameStore(readRigKey)
  const sight = useMemo(() => rigSightOfItems(SHIPPED_ART, rigItemsOfKey(rigKey)), [rigKey])
  useEffect(() => showRigMounts(sight.mounts), [sight])
  return (
    <>
      {sight.mounts.map((mount) => (
        <MountedGear key={`${mount.attachId} ${mount.assetId}`} mount={mount} />
      ))}
      {sight.plates.map((plate) => (
        <MarkPlateMesh key={plate.slot} plate={plate} />
      ))}
    </>
  )
}

function MountedGear({ mount }: { mount: RigMount }) {
  const maps = useMemo(() => atlasMapsOf(SHIPPED_ART, mount.assetId), [mount.assetId])
  return (
    <>
      {mount.quads.map((quad) => (
        <PosedGearQuad key={`${quad.partId} ${String(quad.mirrorY)}`} quad={quad} maps={maps} />
      ))}
    </>
  )
}

/** A part in a group at its pivot, turned and mirrored as its pose and the art say. */
function PosedGearQuad({ quad, maps }: { quad: GearQuad; maps: AtlasMaps | null }) {
  const posed = useMemo(() => pivotedQuadOf(quad), [quad])
  return (
    <group
      position={[posed.pivot[0], posed.pivot[1], 0]}
      rotation={[0, 0, posed.turn]}
      scale={[1, posed.scaleY, 1]}
    >
      <PartQuadMesh quad={posed.quad} maps={maps} baseZ={RIG_Z} />
    </group>
  )
}

/** Lists every mount on the car; returns the call that takes them all back. */
function showRigMounts(mounts: readonly RigMount[]): () => void {
  const hides = mounts.map(({ assetId, attachId, quads }) =>
    showMountedParts({ assetId, attachId }, quads),
  )
  return () => hides.forEach((hide) => hide())
}
