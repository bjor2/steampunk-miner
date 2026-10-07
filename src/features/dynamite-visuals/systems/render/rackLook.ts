/**
 * The dynamite rack at `hull.rear` (#153 "every size unlock is a visible new stick model in the
 * rack", #145a models; took over from the kernel's charge rack in #215): once the rack is bolted
 * on, its frame and one stick for every size open on the planet, so a new size shows the day it
 * unlocks and nothing stacks; the plunger's wire reel from the remote detonator's unlock (#153
 * amendment 2). Which sizes the rack holds is the HUD panel's (#149), not the rack's.
 */
import { isSizeLockedOn } from '../../../../systems/economy/chargeSizes'
import type { ArtCatalogue } from '../../../../systems/art/artCatalogue'
import { atlasMapsOf, type AssetQuad, type AtlasMaps } from '../../../../systems/art/assetLook'
import { attachOf, isAttachId, type AttachUse } from '../../../../systems/registries/vehicleAttach'
import { mountedPartQuadsOf, type PartMount } from '../../../../systems/render/mountedPartLook'
import {
  DYNAMITE_RACK_ASSET_ID,
  dynamiteSizes,
  RACK_FRAME_PART_ID,
  stickPartIdOf,
  WIRE_REEL_PART_ID,
} from './dynamiteArt'

/**
 * The rack rides the `blasting_charges` row's point (the Workshop's reaction for that row sits
 * there too, #180), registered through the K5 attach registry rather than named in the scene.
 */
export const RACK_ITEM_ID = 'blasting_charges'

export const RACK_ATTACH_USE: AttachUse = {
  id: 'dynamite-visuals.rack',
  itemId: RACK_ITEM_ID,
  attach: 'hull.rear',
}

/** What the rack shows from: the local vehicle's rack, the planet and the plunger's row. */
export interface RackSight {
  isRackMounted: boolean
  planetIndex: number
  isDetonatorOpen: boolean
}

/** The part ids the rack shows, frame first; none until it is bolted on. */
export function rackPartIdsOf(sight: RackSight): string[] {
  if (!sight.isRackMounted) return []
  return [RACK_FRAME_PART_ID, ...openStickPartIdsOn(sight.planetIndex), ...reelPartIdsOf(sight)]
}

/** The rack at the point its attach use registers; null while none places it. */
export function rackMountOf(): PartMount | null {
  const attachId = attachOf(RACK_ITEM_ID)
  if (attachId === null || !isAttachId(attachId)) return null
  return { assetId: DYNAMITE_RACK_ASSET_ID, attachId }
}

/** The shown parts in the vehicle's frame at the rack's point. */
export function rackQuadsOf(
  art: ArtCatalogue,
  mount: PartMount,
  shownPartIds: readonly string[],
): AssetQuad[] {
  return mountedPartQuadsOf(art, mount).filter((quad) => shownPartIds.includes(quad.partId))
}

export function rackMaps(art: ArtCatalogue): AtlasMaps | null {
  return atlasMapsOf(art, DYNAMITE_RACK_ASSET_ID)
}

function openStickPartIdsOn(planetIndex: number): string[] {
  return dynamiteSizes()
    .filter((size) => !isSizeLockedOn(size, planetIndex))
    .map(stickPartIdOf)
}

function reelPartIdsOf(sight: RackSight): string[] {
  return sight.isDetonatorOpen ? [WIRE_REEL_PART_ID] : []
}
