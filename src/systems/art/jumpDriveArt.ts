/**
 * The jump drive's art ids (ticket 759; the GD lock on #650: the jump drive has "a visible part on
 * the rig"): one Blender `parts` asset under the vehicle category, named from the kernel's jump
 * drive item in the #52 kebab form, with its one part. Authored in its own frame with the wagon
 * hitch at the origin (K5): the drive's mast stands on the coal tender's frame behind the wagon
 * body (`docs/art/jump-drive/`), so the game draws it at `attachPointOf(vehicleSidecar,
 * 'hull.hitch')` with no offset in code, the kernel's own point beside the tender.
 */
import { KERNEL_ITEMS } from '../registries/kernelItems'
import type { AttachId } from '../registries/vehicleAttach'
import { kebabOf } from './artNaming'

/** `module:jump_drive` draws as `vehicle-jump-drive`. */
export const JUMP_DRIVE_ASSET_ID = `vehicle-${kebabOf(KERNEL_ITEMS.jumpDrive.id)}`

/** The asset's one part: the mast, its windings and the globe. */
export const JUMP_DRIVE_PART_ID = kebabOf(KERNEL_ITEMS.jumpDrive.id)

/** The wagon hitch, the kernel's own point, which the coal tender shares with it. */
export const JUMP_DRIVE_ATTACH_ID: AttachId = 'hull.hitch'
