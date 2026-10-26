/**
 * The coal tender on the car (ticket 758; the GD lock on #650: the fuel tank "shows on the rig as a
 * coal tender wagon on the #576 ladder"): the kernel piece that hangs the tank level's wagon
 * (`fuelTenderLookOf`) from `vehicle-fuel-tank` at the wagon hitch, the point the vehicle's
 * sidecar places, so no offset lives in code (TD acceptance 6 on #166). It changes only when the
 * tank's level does, so it renders through React; behind the body's parts, as the hitch's own draw
 * order is; listed in `steampunkDebug.vehicleParts().mounted` while on the car. The tail's tint
 * above the top step is the vehicle look's (`fuelTenderLookSource.ts`), painted over this part.
 * On a wider rig it keeps its size and its hitch overhang past the scaled stern (ticket 913).
 */
import { useEffect, useMemo } from 'react'
import { FUEL_TENDER_ASSET_ID, FUEL_TENDER_ATTACH_ID } from '../systems/art/fuelTenderArt'
import { atlasMapsOf, type AssetQuad } from '../systems/art/assetLook'
import { fuelTenderLookOf } from '../systems/render/fuelTenderLook'
import type { RigWidth } from '../systems/render/bodyWidthLook'
import {
  mountedPartQuadsOf,
  vehicleAttachXOf,
  type PartMount,
} from '../systems/render/mountedPartLook'
import { useGameStore } from '../store/gameStore'
import { HeldSizeMount } from './HeldSizeMount'
import { showMountedParts } from './mountedPartsPresence'
import { PartQuadMesh } from './PartQuadMesh'
import { SHIPPED_ART } from './shippedArt'

/** Behind the body's parts (0.1) and the dynamite rack (0.06): the wagon trails the stern. */
const TENDER_Z = 0.04
const MOUNT: PartMount = { assetId: FUEL_TENDER_ASSET_ID, attachId: FUEL_TENDER_ATTACH_ID }
const maps = atlasMapsOf(SHIPPED_ART, FUEL_TENDER_ASSET_ID)
const HITCH_X = vehicleAttachXOf(SHIPPED_ART, FUEL_TENDER_ATTACH_ID)

export function FuelTenderPiece({ rig }: { rig: RigWidth }) {
  const partId = useGameStore((state) => fuelTenderLookOf(state.vehicle.fuelTankLevel).partId)
  const quads = useMemo(() => wagonQuadsOf(partId), [partId])
  useEffect(() => showMountedParts(MOUNT, quads), [quads])
  return (
    <HeldSizeMount rig={rig} mountX={HITCH_X}>
      {quads.map((quad) => (
        <PartQuadMesh key={quad.partId} quad={quad} maps={maps} baseZ={TENDER_Z} />
      ))}
    </HeldSizeMount>
  )
}

/** The level's wagon alone, in the vehicle's frame at the hitch. */
function wagonQuadsOf(partId: string): AssetQuad[] {
  return mountedPartQuadsOf(SHIPPED_ART, MOUNT).filter((quad) => quad.partId === partId)
}
