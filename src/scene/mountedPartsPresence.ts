/**
 * What the vehicle's mounted parts draw now (#235), for `steampunkDebug.vehicleParts()`: each
 * `MountedParts` adds its mount while it is on the car and takes it back when it leaves. It
 * changes only when a piece mounts or unmounts, so it is a plain module record, never React state
 * or the store. A mount drawn for items (the #166 gear) also names them, so a look swap covering
 * them (ticket 892) need not yield its point to their art; the debug read lists mounts as before.
 * Render-only, like the attach points it names.
 */
import type { AssetQuad } from '../systems/art/assetLook'
import type { PartMount } from '../systems/render/mountedPartLook'
import type { PointHolder } from '../systems/render/swapCovers'

/** One asset on the car: its point and the part ids it draws there. */
export interface MountedPartsShown extends PartMount {
  partIds: string[]
}

const NO_ITEMS: readonly string[] = []

/** Each shown mount with the items it is drawn for. */
const shown = new Map<MountedPartsShown, readonly string[]>()

/**
 * Shows the mount's parts until the returned call takes them back; `itemIds` are the items whose
 * art they are, none for a part no item owns.
 */
export function showMountedParts(
  mount: PartMount,
  quads: readonly AssetQuad[],
  itemIds: readonly string[] = NO_ITEMS,
): () => void {
  const entry = { ...mount, partIds: quads.map((quad) => quad.partId) }
  shown.set(entry, itemIds)
  return () => shown.delete(entry)
}

/** Every mount on the car, by attach point, then asset. */
export function mountedPartsShown(): MountedPartsShown[] {
  return [...shown.keys()].sort(byPointThenAsset)
}

/** What holds each point a mount is on: the point and the items drawn there (ticket 892). */
export function pointHoldersShown(): PointHolder[] {
  return [...shown].map(([mount, itemIds]) => ({ attachId: mount.attachId, itemIds }))
}

function byPointThenAsset(a: PartMount, b: PartMount): number {
  return a.attachId.localeCompare(b.attachId) || a.assetId.localeCompare(b.assetId)
}
