/**
 * The coal tender's art ids (ticket 758; the GD lock on #650: the fuel tank "shows on the rig as a
 * coal tender wagon on the #576 ladder"): one Blender `parts` asset under the vehicle category,
 * named from the kernel's fuel tank item in the #52 kebab form, with a wagon part per step of the
 * tender's ladder (`render/fuelTenderLook.ts`), hung at the wagon hitch. The asset is authored in
 * its own frame with the hitch at the origin (K5), so the game draws a wagon at
 * `attachPointOf(vehicleSidecar, 'hull.hitch')` with no offset in code.
 */
import { KERNEL_ITEMS } from '../registries/kernelItems'
import type { AttachId } from '../registries/vehicleAttach'
import { FUEL_TENDER_TABLE, fuelTenderPartIds } from '../render/fuelTenderLook'
import { kebabOf } from './artNaming'

/** `service:fuel_tank` draws as `vehicle-fuel-tank`. */
export const FUEL_TENDER_ASSET_ID = `vehicle-${kebabOf(KERNEL_ITEMS.fuelTank.id)}`

/** The wagon hitch (TD after the Horizontal Scaler review on #162): a rig-look part never takes it. */
export const FUEL_TENDER_ATTACH_ID: AttachId = 'hull.hitch'

/** Every wagon part the asset holds, one per ladder step. */
export function fuelTenderArtPartIds(): string[] {
  return fuelTenderPartIds(FUEL_TENDER_TABLE)
}
