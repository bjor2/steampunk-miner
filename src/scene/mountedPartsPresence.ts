/**
 * What the vehicle's mounted parts draw now (#235), for `steampunkDebug.vehicleParts()`: each
 * `MountedParts` adds its mount while it is on the car and takes it back when it leaves. It
 * changes only when a piece mounts or unmounts, so it is a plain module record, never React state
 * or the store. Render-only, like the attach points it names.
 */
import type { AssetQuad } from '../systems/art/assetLook'
import type { PartMount } from '../systems/render/mountedPartLook'

/** One asset on the car: its point and the part ids it draws there. */
export interface MountedPartsShown extends PartMount {
  partIds: string[]
}

const shown = new Set<MountedPartsShown>()

/** Shows the mount's parts until the returned call takes them back. */
export function showMountedParts(mount: PartMount, quads: readonly AssetQuad[]): () => void {
  const entry = { ...mount, partIds: quads.map((quad) => quad.partId) }
  shown.add(entry)
  return () => shown.delete(entry)
}

/** Every mount on the car, by attach point, then asset. */
export function mountedPartsShown(): MountedPartsShown[] {
  return [...shown].sort(byPointThenAsset)
}

function byPointThenAsset(a: PartMount, b: PartMount): number {
  return a.attachId.localeCompare(b.attachId) || a.assetId.localeCompare(b.assetId)
}
