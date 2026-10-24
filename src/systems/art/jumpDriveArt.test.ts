import { describe, expect, it } from 'vitest'
import { SHIPPED_ART } from '../../scene/shippedArt'
import { isAttachId } from '../registries/vehicleAttach'
import { blenderAssetIds, categoryOfAssetId, isValidPartId, registryPartIds } from './artIds'
import { manifestEntryOf, placeholderSidecarOf } from './artCatalogue'
import { FUEL_TENDER_ATTACH_ID } from './fuelTenderArt'
import { JUMP_DRIVE_ASSET_ID, JUMP_DRIVE_ATTACH_ID, JUMP_DRIVE_PART_ID } from './jumpDriveArt'

// The jump drive (ticket 759; the GD lock on #650: "a visible part on the rig"): a kernel Blender
// asset named from the jump drive item, one part standing on the coal tender's frame at the hitch.
describe('jump drive art', () => {
  it('names the asset from the kernel jump drive item under the vehicle category', () => {
    expect(JUMP_DRIVE_ASSET_ID).toBe('vehicle-jump-drive')
    expect(categoryOfAssetId(JUMP_DRIVE_ASSET_ID)).toBe('vehicle')
    expect(blenderAssetIds()).toContain(JUMP_DRIVE_ASSET_ID)
  })

  it("stands at the wagon hitch, the kernel's own point it shares with the coal tender", () => {
    expect(isAttachId(JUMP_DRIVE_ATTACH_ID)).toBe(true)
    expect(JUMP_DRIVE_ATTACH_ID).toBe(FUEL_TENDER_ATTACH_ID)
  })

  it('takes its one part', () => {
    expect(registryPartIds()).toContain(JUMP_DRIVE_PART_ID)
    expect(isValidPartId(JUMP_DRIVE_ASSET_ID, JUMP_DRIVE_PART_ID)).toBe(true)
    expect(isValidPartId(JUMP_DRIVE_ASSET_ID, 't1-wheel')).toBe(false)
  })

  it('ships a final manifest entry and a placeholder of its one part at the hitch, over the wagon', () => {
    expect(manifestEntryOf(SHIPPED_ART, JUMP_DRIVE_ASSET_ID)?.status).toBe('final')
    const placeholder = placeholderSidecarOf(SHIPPED_ART, JUMP_DRIVE_ASSET_ID)
    expect(placeholder?.parts.map((part) => part.id)).toEqual([JUMP_DRIVE_PART_ID])
    expect(placeholder?.parts[0]).toMatchObject({ atM: [0, 0], z: 1 })
  })
})
