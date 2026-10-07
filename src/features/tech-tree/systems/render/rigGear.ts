/**
 * What the rig carries on the run vehicle (ticket 250, the #166 gear drawn through the #235 seam):
 * every mounted item of the loadout that a slice has registered, its quads at the base vehicle's
 * attach points, grouped by asset and point so the debug read lists what hangs where. An item
 * still a vision row (no registered `vehicle-item`) never draws, whatever the loadout says.
 * Render-only: nothing here reaches the authority, a snapshot or a digest.
 */
import {
  exportedSidecarOf,
  manifestEntryOf,
  placeholderSidecarOf,
  type ArtCatalogue,
} from '../../../../systems/art/artCatalogue'
import type { Pair, PartsSidecar } from '../../../../systems/art/partsSidecar'
import { ATTACH_ASSET_ID } from '../../../../systems/art/sidecarAttach'
import type { AttachId } from '../../../../systems/registries/vehicleAttach'
import { isVehicleItemId } from '../../../../systems/registries/vehicleLoadout'
import type { VehicleLoadout } from '../../../../systems/vehicle/loadoutState'
import { mountedGearOf } from './techGear'
import {
  gearAttachIdOf,
  mountedGearQuadsOf,
  mountedItemsOf,
  type GearQuad,
  type MountedItem,
} from './techGearQuads'

/**
 * Extractors stay folded flat: their unfold follows the drill's work on a gated cell, which
 * 148b (#237) drives.
 */
export const FOLDED = 0

/** One asset at one point, with every quad it draws there, each shared part once. */
export interface RigMount {
  assetId: string
  attachId: AttachId
  quads: GearQuad[]
}

/**
 * A gear quad as its group draws it: the group sits at the pivot, turns and (for the far-side
 * copy) mirrors in height, and holds the quad about the pivot, so the posed part lands where
 * `mountedGearQuadsOf` placed it.
 */
export interface PivotedQuad {
  pivot: Pair
  turn: number
  scaleY: 1 | -1
  quad: GearQuad
}

/** The loadout's mounted items that a slice has registered, in `mountedItemsOf` order. */
export function rigItemsOf(loadout: VehicleLoadout): MountedItem[] {
  return mountedItemsOf(loadout).filter((item) => isVehicleItemId(item.itemId))
}

/**
 * The base vehicle's sidecar the points come from: the exported one once the vehicle is final,
 * else its placeholder, as `vehicleAttachPointOf` reads them (#235); null when neither exists.
 */
export function rigSidecarOf(art: ArtCatalogue): PartsSidecar | null {
  const isFinal = manifestEntryOf(art, ATTACH_ASSET_ID)?.status === 'final'
  const exported = isFinal ? exportedSidecarOf(art, ATTACH_ASSET_ID) : null
  return exported ?? placeholderSidecarOf(art, ATTACH_ASSET_ID)
}

/** Every item's quads, folded, grouped by asset and point, sorted by point, then asset. */
export function rigMountsOf(
  art: ArtCatalogue,
  vehicle: PartsSidecar,
  items: readonly MountedItem[],
): RigMount[] {
  const mounts = items.flatMap((item) => itemMountOf(art, vehicle, item))
  return mergedByAssetAndPoint(mounts).sort(byPointThenAsset)
}

export function pivotedQuadOf(quad: GearQuad): PivotedQuad {
  const scaleY = quad.mirrorY ? -1 : 1
  const [pivotX, pivotY] = quad.pivot
  const centre: Pair = [quad.centre[0] - pivotX, (quad.centre[1] - pivotY) * scaleY]
  return { pivot: quad.pivot, turn: quad.turn, scaleY, quad: { ...quad, centre, pivot: [0, 0] } }
}

function itemMountOf(art: ArtCatalogue, vehicle: PartsSidecar, item: MountedItem): RigMount[] {
  const gear = mountedGearOf(item.itemId)
  const attachId = gear === null ? null : gearAttachIdOf(gear, item.slot)
  const quads = mountedGearQuadsOf(art, vehicle, item, FOLDED)
  if (gear === null || attachId === null || quads.length === 0) return []
  return [{ assetId: gear.assetId, attachId, quads }]
}

/** Two consumables share the crate shelf: one mount, the shelf drawn once. */
function mergedByAssetAndPoint(mounts: readonly RigMount[]): RigMount[] {
  const merged = new Map<string, RigMount>()
  for (const mount of mounts) {
    const key = `${mount.attachId} ${mount.assetId}`
    const held = merged.get(key)
    merged.set(key, held === undefined ? mount : { ...held, quads: joinedQuads(held, mount) })
  }
  return [...merged.values()]
}

function joinedQuads(held: RigMount, mount: RigMount): GearQuad[] {
  return [...held.quads, ...mount.quads.filter((quad) => !held.quads.some(isSamePart(quad)))]
}

function isSamePart(quad: GearQuad) {
  return (other: GearQuad) => other.partId === quad.partId && other.mirrorY === quad.mirrorY
}

function byPointThenAsset(a: RigMount, b: RigMount): number {
  return a.attachId.localeCompare(b.attachId) || a.assetId.localeCompare(b.assetId)
}
