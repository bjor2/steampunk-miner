/**
 * The unlock reveal (ticket 718, spec #678 Progression 1): which buys reveal, what they show, and
 * how long. A buy reveals when `reveal.json` names its event and the kernel's shared table counts
 * what it bought as a new capability (`isNewCapabilityBuy`, the flag the shop's guidance chip
 * reads), so a stat step, a refill or a service never does. The reveal runs `revealTicks` from the
 * buy's own tick, so it lasts the same at any frame rate. Pure: events in, a reveal out.
 */
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { contentOf } from '../../../systems/registries/content'
import type { ItemRef } from '../../../systems/registries/itemDescriber'
import { vehicleItemOfferOf } from '../../../systems/registries/vehicleItemSales'
import { isNewCapabilityBuy, NONE_OWNED } from '../../../systems/views/newCapability'
import { REVEAL, type RevealData, type RevealEventRow, type RevealItemRow } from './revealData'

/** What the plate names the bought item by: its name and icon (the car's glow is `revealOnRig`). */
export interface RevealedItem {
  item: ItemRef
  name: string
  iconId: string
}

export interface UnlockReveal {
  revealed: RevealedItem
  /** The buy's tick; the reveal plays until `endTick`, exclusive. */
  startTick: number
  endTick: number
}

interface BoughtCapability {
  item: ItemRef
  tick: number
}

/** The reveal the local player's batch starts: its last new capability bought; null for none. */
export function revealOfBatch(
  events: readonly DomainEvent[],
  playerId: string,
  data: RevealData = REVEAL,
): UnlockReveal | null {
  const bought = events.flatMap((event) => capabilitiesBoughtBy(event, playerId, data)).at(-1)
  return bought === undefined ? null : revealOf(bought, data)
}

export function isRevealPlayingAt(reveal: UnlockReveal, tick: number): boolean {
  return tick >= reveal.startTick && tick < reveal.endTick
}

/** The item's reveal row, or for a vehicle item its own data: the seller's name and its icon. */
export function revealedItemOf(item: ItemRef, data: RevealData = REVEAL): RevealedItem {
  const row = revealRowOf(item, data)
  if (row !== undefined) return { item, name: row.name, iconId: row.iconId }
  return vehicleItemRevealOf(item)
}

export function revealRowOf(item: ItemRef, data: RevealData = REVEAL): RevealItemRow | undefined {
  return data.items.find((listed) => listed.kind === item.kind && listed.id === item.id)
}

function revealOf({ item, tick }: BoughtCapability, data: RevealData): UnlockReveal {
  return { revealed: revealedItemOf(item, data), startTick: tick, endTick: tick + data.revealTicks }
}

function capabilitiesBoughtBy(
  event: DomainEvent,
  playerId: string,
  data: RevealData,
): BoughtCapability[] {
  const row = data.events.find((candidate) => candidate.type === event.type)
  const item = row === undefined || event.playerId !== playerId ? null : itemBoughtBy(row, event)
  return item !== null && isNewCapabilityBuy(item, NONE_OWNED) ? [{ item, tick: event.tick }] : []
}

/** The row's fixed id, or the id the event carries in the row's field. */
function itemBoughtBy(row: RevealEventRow, event: DomainEvent): ItemRef | null {
  const id = row.id ?? fieldOf(event, row.idField)
  return typeof id === 'string' ? { kind: row.kind, id } : null
}

function fieldOf(event: DomainEvent, field: string | undefined): unknown {
  return field === undefined ? undefined : (event as unknown as Record<string, unknown>)[field]
}

function vehicleItemRevealOf(item: ItemRef): RevealedItem {
  return {
    item,
    name: vehicleItemOfferOf(item.id)?.name ?? item.id,
    iconId: contentOf('vehicle-item').find((entry) => entry.id === item.id)?.iconId ?? item.id,
  }
}
