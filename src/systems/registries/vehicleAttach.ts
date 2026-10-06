/**
 * Where an item sits on the vehicle (docs/standards/feature-slices.md 3.11, #162): render-only.
 * Attach data never enters the authority state, a snapshot or a digest; only scene code reads it.
 */
import { contentOf } from './content'
import { defineRegistry, entriesOf } from './seal'

export const ATTACH_IDS = [
  'drill.head',
  'drill.flank',
  'drill.collar',
  'drill.hood',
  'hull.front',
  'hull.arm.left',
  'hull.arm.right',
  'hull.roof.fore',
  'hull.roof.mid',
  'hull.roof.aft',
  'hull.turret',
  'hull.rear',
  'cab.gauge',
] as const

export type AttachId = (typeof ATTACH_IDS)[number]

export interface AttachUse {
  id: string
  itemId: string
  attach: AttachId
}

export const ATTACH_USE_REGISTRY = defineRegistry<AttachUse>('vehicleAttach')

/** A registered attach use (the lowest id first), else the item's own `attach`, else null. */
export function attachOf(itemId: string): AttachId | null {
  const use = entriesOf(ATTACH_USE_REGISTRY).find((candidate) => candidate.itemId === itemId)
  return use?.attach ?? itemAttachOf(itemId)
}

function itemAttachOf(itemId: string): AttachId | null {
  return contentOf('vehicle-item').find((item) => item.id === itemId)?.attach ?? null
}
