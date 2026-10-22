/**
 * Which buys are a new capability (spec #678, Progression 1 and 2): the one data flag the unlock
 * reveal (ticket 718) and the shop's guidance chip (ticket 719) share, read from
 * `data/shop/newCapabilities.json`. A capability is new only while the rig owns none of it, so the
 * turret's mount counts and its later levels are stat steps. Pure: an item ref and a level in, a
 * yes or no out.
 */
import TABLE_FILE from '../../data/shop/newCapabilities.json'
import type { ItemKind, ItemRef } from '../registries/itemDescriber'

export interface NewCapabilityTable {
  /** Every item of these kinds is one. */
  kinds: readonly string[]
  /** And these items, named one by one. */
  items: readonly ItemRef[]
}

export const NEW_CAPABILITIES: NewCapabilityTable = {
  kinds: TABLE_FILE.kinds,
  items: TABLE_FILE.items.map(({ kind, id }) => ({ kind: kind as ItemKind, id })),
}

/** Nothing of the item owned yet: no level, grade or count. */
export const NONE_OWNED = 0

export function isNewCapabilityItem(
  item: ItemRef,
  table: NewCapabilityTable = NEW_CAPABILITIES,
): boolean {
  return table.kinds.includes(item.kind) || table.items.some((listed) => isSameItem(listed, item))
}

/** A buy that gives the rig a capability it lacks: a listed item of which none is owned. */
export function isNewCapabilityBuy(
  item: ItemRef,
  levelOwned: number,
  table: NewCapabilityTable = NEW_CAPABILITIES,
): boolean {
  return levelOwned === NONE_OWNED && isNewCapabilityItem(item, table)
}

function isSameItem(a: ItemRef, b: ItemRef): boolean {
  return a.kind === b.kind && a.id === b.id
}
