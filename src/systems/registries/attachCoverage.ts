/**
 * The attach coverage rule (#162 TD "vehicle sockets locked", restated in the socket amendments;
 * K5 #188):
 * 1. every item with a physical part names exactly one attach, and that point exists in
 *    `ATTACH_IDS` and in the vehicle sidecar; `"slot"` is valid only for `powerup.*` items;
 * 2. no two items that can be on the vehicle together share a point. An owned item that takes no
 *    loadout slot (an extractor, a slotless passive) counts as always equipped.
 */
import { contentOf } from './content'
import {
  attachOf,
  isAttachId,
  slotAttachPointOf,
  type AttachId,
  type ItemAttach,
} from './vehicleAttach'
import { acceptedSlotsOf, LOADOUT_SLOT_IDS, type LoadoutSlotId } from './vehicleLoadout'

export interface AttachedItem {
  id: string
  /** Every slot the item is accepted in; none for an item that is mounted once owned. */
  slots: readonly LoadoutSlotId[]
  attach: ItemAttach | null
}

/**
 * Points the vehicle's own upgrades always draw at, so no item may take one: `drill_power` on
 * `drill.housing` (#180, TD: always occupied), the auto-guns turret (#107, "registered so nothing
 * else is put there") and the six #180 showcase track points.
 */
export const VEHICLE_HELD_ATTACH_IDS: readonly AttachId[] = [
  'drill.housing',
  'hull.turret',
  'chassis.drive',
  'hull.boiler',
  'hull.stack',
  'hull.cargo',
  'hull.plates',
  'hull.liner',
]

/**
 * Points that hold one cluster asset many items extend: the cab gauge cluster, whose owned gauges
 * are dial variants (TD after the Horizontal Scaler review), and the charge rack, whose consumable
 * crates and flare mortar ride it (TD sockets table; G&V mortar pick, #162).
 */
export const SHARED_ATTACH_IDS: readonly AttachId[] = ['cab.gauge', 'hull.rear']

/** Why the items break the coverage rule against the sidecar's points; empty when they keep it. */
export function attachCoverageProblems(
  items: readonly AttachedItem[],
  sidecarAttachIds: readonly string[],
): string[] {
  return [
    ...items.flatMap((item) => itemAttachProblems(item, sidecarAttachIds)),
    ...sharedPointProblems(items),
  ]
}

/** Every registered `vehicle-item` with its accepted slots and resolved attach. */
export function attachedItemsOfRegistries(): AttachedItem[] {
  return contentOf('vehicle-item').map((item) => ({
    id: item.id,
    slots: acceptedSlotsOf(item.id),
    attach: attachOf(item.id),
  }))
}

function itemAttachProblems(item: AttachedItem, sidecarAttachIds: readonly string[]): string[] {
  if (item.attach === null) return []
  const problems =
    item.attach === 'slot'
      ? slotAttachProblems(item)
      : namedAttachProblems(item.attach, sidecarAttachIds)
  return problems.map((problem) => `item "${item.id}" ${problem}`)
}

function slotAttachProblems(item: AttachedItem): string[] {
  return isOnlyInPowerUpSlots(item) ? [] : ['declares attach "slot" but goes in a non-powerup slot']
}

function namedAttachProblems(attach: string, sidecarAttachIds: readonly string[]): string[] {
  if (!isAttachId(attach)) return [`names "${attach}", which is not an attach id`]
  const problems: string[] = []
  if (!sidecarAttachIds.includes(attach))
    problems.push(`names "${attach}", which the sidecar lacks`)
  if (VEHICLE_HELD_ATTACH_IDS.includes(attach))
    problems.push(`names "${attach}", which the vehicle holds`)
  if (isSlotPoint(attach)) problems.push(`names "${attach}"; slot points are taken through "slot"`)
  return problems
}

function sharedPointProblems(items: readonly AttachedItem[]): string[] {
  return pairsOf(items)
    .filter(([first, second]) => isClashingPair(first, second))
    .map(
      ([first, second]) =>
        `items "${first.id}" and "${second.id}" can be on the vehicle together but share "${String(first.attach)}"`,
    )
}

function isClashingPair(first: AttachedItem, second: AttachedItem): boolean {
  return isSameExclusivePoint(first.attach, second.attach) && canBeOnVehicleTogether(first, second)
}

/** `"slot"` items never clash: each draws at its own slot's point. */
function isSameExclusivePoint(first: ItemAttach | null, second: ItemAttach | null): boolean {
  const isNamedPoint = first !== null && first !== 'slot' && !SHARED_ATTACH_IDS.includes(first)
  return isNamedPoint && first === second
}

/** Items in the same single slot never coexist; an item mounted once owned coexists with anything. */
function canBeOnVehicleTogether(first: AttachedItem, second: AttachedItem): boolean {
  if (isMountedOnceOwned(first) || isMountedOnceOwned(second)) return true
  return first.slots.some((slot) => second.slots.some((other) => other !== slot))
}

function isMountedOnceOwned(item: AttachedItem): boolean {
  return item.slots.length === 0
}

function isOnlyInPowerUpSlots(item: AttachedItem): boolean {
  return item.slots.length > 0 && item.slots.every((slot) => slotAttachPointOf(slot) !== null)
}

function isSlotPoint(attach: AttachId): boolean {
  return LOADOUT_SLOT_IDS.some((slot) => slotAttachPointOf(slot) === attach)
}

function pairsOf<T>(items: readonly T[]): [T, T][] {
  return items.flatMap((first, at) => items.slice(at + 1).map((second): [T, T] => [first, second]))
}
