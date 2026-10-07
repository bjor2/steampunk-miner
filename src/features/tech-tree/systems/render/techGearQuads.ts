/**
 * Where a mounted item's parts draw on the vehicle (#162 TD sockets, K5 #188, art #166): each
 * asset's quads moved to the attach point the vehicle sidecar carries, with no hand-placed offset.
 * A `"slot"` item draws at the `hull.powerup.n` of the slot it is equipped in; a mirrored item is
 * drawn twice, the second time flipped about the drill axis. The wiring ticket mounts these in a
 * scene piece; the review renders place the same `.blend` parts by the same sidecar points.
 */
import { assetQuadsOf, type AssetQuad } from '../../../../systems/art/assetLook'
import type { ArtCatalogue } from '../../../../systems/art/artCatalogue'
import { attachPointOf, type Pair, type PartsSidecar } from '../../../../systems/art/partsSidecar'
import { slotAttachPointOf, type AttachId } from '../../../../systems/registries/vehicleAttach'
import type { LoadoutSlotId } from '../../../../systems/registries/vehicleLoadout'
import type { VehicleLoadout } from '../../../../systems/vehicle/loadoutState'
import { partPoseAt } from './extractorPose'
import { mountedGearOf, type MountedGear } from './techGear'

/** The asset's one look: every gear part is authored untiered. */
const ONLY_LOOK = 1

/** A quad placed in the vehicle's frame, with the turn its group applies about `pivot`. */
export interface GearQuad extends AssetQuad {
  itemId: string
  turn: number
  /** Flipped about the drill axis: the far-side copy of a mirrored part. */
  mirrorY: boolean
}

/** An item on the vehicle: equipped in `slot`, or null for one mounted by ownership alone. */
export interface MountedItem {
  itemId: string
  slot: LoadoutSlotId | null
}

/** The point an item draws at when it sits in `slot`; null when it has none. */
export function gearAttachIdOf(gear: MountedGear, slot: LoadoutSlotId | null): AttachId | null {
  if (gear.attach !== 'slot') return gear.attach
  return slot === null ? null : slotAttachPointOf(slot)
}

/** Every item the loadout draws: what is owned with no slot, and what sits in a slot. */
export function mountedItemsOf(loadout: VehicleLoadout): MountedItem[] {
  const slotted = Object.entries(loadout.slots)
    .filter((entry): entry is [LoadoutSlotId, string] => entry[1] !== null)
    .map(([slot, itemId]) => ({ itemId, slot }))
  const unslotted = loadout.owned
    .filter((itemId) => mountedGearOf(itemId)?.attach !== 'slot')
    .filter((itemId) => !slotted.some((item) => item.itemId === itemId))
    .map((itemId) => ({ itemId, slot: null }))
  return [...unslotted, ...slotted]
}

/**
 * The item's quads at its attach point, posed `fraction` deployed (0 folded, 1 at work). Empty
 * for an item with no gear or no point.
 */
export function mountedGearQuadsOf(
  art: ArtCatalogue,
  vehicle: PartsSidecar,
  item: MountedItem,
  fraction: number,
): GearQuad[] {
  const gear = mountedGearOf(item.itemId)
  const attachId = gear === null ? null : gearAttachIdOf(gear, item.slot)
  const point = attachId === null ? null : attachPointOf(vehicle, attachId)
  if (gear === null || point === null) return []
  const placed = gearQuadsOf(art, gear, fraction).map((quad) => movedBy(quad, point.atM))
  return gear.mirrored
    ? [...placed, ...placed.map((quad) => mirroredAbout(quad, point.atM))]
    : placed
}

/** Every mounted item's quads, each shared part (a cluster, a shelf) drawn once. */
export function vehicleGearQuadsOf(
  art: ArtCatalogue,
  vehicle: PartsSidecar,
  items: readonly MountedItem[],
  fractionOf: (itemId: string) => number,
): GearQuad[] {
  const quads = items.flatMap((item) =>
    mountedGearQuadsOf(art, vehicle, item, fractionOf(item.itemId)),
  )
  return quads.filter((quad, at) => quads.findIndex((other) => isSamePart(other, quad)) === at)
}

function gearQuadsOf(art: ArtCatalogue, gear: MountedGear, fraction: number): GearQuad[] {
  return assetQuadsOf(art, gear.assetId, ONLY_LOOK).flatMap((quad) => {
    const part = gear.parts.find((candidate) => candidate.id === quad.partId)
    if (part === undefined) return []
    const pose = partPoseAt(part, fraction)
    return [{ ...movedBy(quad, pose.shift), itemId: gear.itemId, turn: pose.turn, mirrorY: false }]
  })
}

function movedBy<Q extends AssetQuad>(quad: Q, by: Pair): Q {
  return { ...quad, centre: shifted(quad.centre, by), pivot: shifted(quad.pivot, by) }
}

function shifted([x, z]: Pair, [dx, dz]: Pair): Pair {
  return [x + dx, z + dz]
}

/** The copy below the drill axis: mirrored in height about the point, its turn reversed. */
function mirroredAbout(quad: GearQuad, [, axisZ]: Pair): GearQuad {
  return {
    ...quad,
    centre: [quad.centre[0], 2 * axisZ - quad.centre[1]],
    pivot: [quad.pivot[0], 2 * axisZ - quad.pivot[1]],
    turn: -quad.turn,
    mirrorY: true,
  }
}

function isSamePart(a: GearQuad, b: GearQuad): boolean {
  return a.partId === b.partId && a.mirrorY === b.mirrorY && a.centre[0] === b.centre[0]
}
