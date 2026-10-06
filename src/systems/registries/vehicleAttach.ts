/**
 * Where an item sits on the vehicle (docs/standards/feature-slices.md 3.11, #162): render-only.
 * Attach data never enters the authority state, a snapshot or a digest; only scene code reads it.
 */
import { contentOf } from './content'
import { defineRegistry, entriesOf } from './seal'
import type { LoadoutSlotId } from './vehicleLoadout'

// The 13 points the TD locked on #162, then `drill.fork` and `hull.powerup.1`-`5` (TD socket
// amendments), the six #180 showcase points, `drill.housing` (#180, GD call) and `hull.hitch`
// (TD after the Horizontal Scaler review): 27 ids, K5 #188.
export const ATTACH_IDS = [
  'drill.head',
  'drill.flank',
  'drill.collar',
  'drill.hood',
  'drill.fork',
  'drill.housing',
  'hull.front',
  'hull.arm.left',
  'hull.arm.right',
  'hull.roof.fore',
  'hull.roof.mid',
  'hull.roof.aft',
  'hull.turret',
  'hull.rear',
  'hull.hitch',
  'hull.boiler',
  'hull.stack',
  'hull.cargo',
  'hull.plates',
  'hull.liner',
  'hull.powerup.1',
  'hull.powerup.2',
  'hull.powerup.3',
  'hull.powerup.4',
  'hull.powerup.5',
  'chassis.drive',
  'cab.gauge',
] as const

export type AttachId = (typeof ATTACH_IDS)[number]

/**
 * A named point, or `"slot"`: a power-up with no signature part draws at the `hull.powerup.n` of
 * the `powerup.n` slot it is equipped in (TD socket amendments on #162).
 */
export type ItemAttach = AttachId | 'slot'

export interface AttachUse {
  id: string
  itemId: string
  attach: ItemAttach
}

export const ATTACH_USE_REGISTRY = defineRegistry<AttachUse>('vehicleAttach')

/** A registered attach use (the lowest id first), else the item's own `attach`, else null. */
export function attachOf(itemId: string): ItemAttach | null {
  const use = entriesOf(ATTACH_USE_REGISTRY).find((candidate) => candidate.itemId === itemId)
  return use?.attach ?? itemAttachOf(itemId)
}

/** The point an item equipped in `slot` draws at; null for an item with no physical part. */
export function attachPointOfEquipped(itemId: string, slot: LoadoutSlotId): AttachId | null {
  const attach = attachOf(itemId)
  return attach === 'slot' ? slotAttachPointOf(slot) : attach
}

/** `powerup.n` draws at `hull.powerup.n`; no other slot has a point of its own. */
export function slotAttachPointOf(slot: LoadoutSlotId): AttachId | null {
  const point = `hull.${slot}`
  return isAttachId(point) ? point : null
}

export function isAttachId(id: string): id is AttachId {
  return (ATTACH_IDS as readonly string[]).includes(id)
}

function itemAttachOf(itemId: string): ItemAttach | null {
  return contentOf('vehicle-item').find((item) => item.id === itemId)?.attach ?? null
}
