/**
 * The rig gear's side of the cover seam (ticket 892, GD lock 6402021452 on #623, TD 6402023994):
 * while a look swap covering an item shows, every mount drawn for that item steps aside (its
 * loadout socket and a fork branch's piece alike, so the Wide branch's hang of the side cutters'
 * art goes too), and comes back unchanged once the swap stops showing. Every covered id the
 * shipped rig looks name is a row of `techGear.json`, checked when this loads, so a look never
 * stands for art the rig cannot draw. `itemDrawsOf` counts what draws each equipped item, the
 * max-loadout check's rule: its own art or one covering look, exactly once. Render-only.
 */
import {
  swapAssetIdOf,
  type PartSwapRequest,
} from '../../../../systems/registries/partMotionRequests'
import { coversOf } from '../../../../systems/render/swapCovers'
import { SHIPPED_RIG_LOOKS, type TrackLookRows } from '../../../rig-look'
import type { RigMount } from './rigGear'
import { MOUNTED_GEAR, type MountedGear } from './techGear'
import type { MountedItem } from './techGearQuads'

/** What draws one equipped item: the mounts of its own art and the looks that cover it. */
export interface ItemDraws {
  itemId: string
  /** `assetId@attachId` of each mount drawing the item's art. */
  art: string[]
  /** `assetId:partId@attach` of each showing swap covering the item. */
  looks: string[]
}

export class RigCoverError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`rig look covers: ${problems.join('; ')}`)
    this.name = 'RigCoverError'
  }
}

/** Why the tracks' covers name items the gear table lacks; empty when every one is a row. */
export function rigCoverProblemsOf(
  tracks: readonly TrackLookRows[],
  gear: readonly MountedGear[],
): string[] {
  return tracks.flatMap((rows) =>
    (rows.covers ?? [])
      .filter((itemId) => !gear.some((row) => row.itemId === itemId))
      .map((itemId) => `${rows.track}: covers ${itemId}, which has no techGear.json row`),
  )
}

/** The item ids `tracks` cover once they pass the check; throws with every problem listed. */
export function readCoveredGearIds(
  tracks: readonly TrackLookRows[],
  gear: readonly MountedGear[],
): string[] {
  const problems = rigCoverProblemsOf(tracks, gear)
  if (problems.length > 0) throw new RigCoverError(problems)
  return [...new Set(tracks.flatMap((rows) => rows.covers ?? []))].sort()
}

/** Every item some shipped rig look covers, each a gear row (checked when the rig gear loads). */
export const COVERED_GEAR_IDS: readonly string[] = readCoveredGearIds(
  SHIPPED_RIG_LOOKS.tracks.map((frames) => frames.rows),
  MOUNTED_GEAR,
)

/** The rig's items without those a showing swap covers; the same items when none is covered. */
export function uncoveredItemsOf(
  items: readonly MountedItem[],
  coveredItemIds: readonly string[],
): MountedItem[] {
  if (coveredItemIds.length === 0) return [...items]
  return items.filter((item) => !coveredItemIds.includes(item.itemId))
}

/** For each item, in order: the mounts drawing its art and the showing swaps covering it. */
export function itemDrawsOf(
  items: readonly MountedItem[],
  mounts: readonly RigMount[],
  swaps: readonly PartSwapRequest[],
): ItemDraws[] {
  return [...new Set(items.map((item) => item.itemId))].map((itemId) => ({
    itemId,
    art: mounts.filter((mount) => isDrawingItem(mount, itemId)).map(mountNameOf),
    looks: swaps.filter((swap) => coversOf(swap).includes(itemId)).map(swapNameOf),
  }))
}

/** Whether the item draws exactly once: by its own art, or by one look covering it. */
export function isDrawnOnce(draws: ItemDraws): boolean {
  return draws.art.length + draws.looks.length === 1
}

function isDrawingItem(mount: RigMount, itemId: string): boolean {
  return mount.quads.some((quad) => quad.itemId === itemId)
}

function mountNameOf(mount: RigMount): string {
  return `${mount.assetId}@${mount.attachId}`
}

function swapNameOf(swap: PartSwapRequest): string {
  return `${swapAssetIdOf(swap)}:${swap.partIds.join('+')}@${swap.attach}`
}
