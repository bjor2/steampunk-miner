/**
 * Folding a step's ore touches into one player's ore discoveries (#207): the first touch of a type
 * sets its `contacted` bit and says so, its first unit in the hold sets `mined` (and `contacted`,
 * if nothing touched it first) and says so. A type already set says nothing, so each event comes
 * once per player per type however many touches one step holds.
 */
import type { DomainEventBody } from '../../../systems/authority/domainEvent'
import { oreBitIndexOf, oreIndexTag, type OreType } from '../../../systems/registries/oreTypes'
import { base64OfBytes, bytesOfBase64 } from './base64Bytes'
import { hasBit, withBit } from './bitset'
import type { OreDiscoveries } from './codexSection'
import { oreFactsOf, type ContactRoute } from './codexEvents'
import { oreBitsOnCurrentIndex, oreKeyOf } from './oreBits'

export interface OreTouch {
  ore: OreType
  via: ContactRoute
  /** A unit of it reached the hold. */
  isMined: boolean
}

export interface OreRecord {
  ore: OreDiscoveries
  events: DomainEventBody[]
}

interface OreBits {
  contacted: Uint8Array
  mined: Uint8Array
}

/** The discoveries after the touches, on the current index; unchanged when nothing was new. */
export function recordOreTouches(current: OreDiscoveries, touches: readonly OreTouch[]): OreRecord {
  const start = { ...oreBitsOf(current), events: [] }
  const recorded = touches.reduce(recordOreTouch, start)
  if (recorded.events.length === 0) return { ore: current, events: [] }
  return { ore: oreDiscoveriesOfBits(recorded), events: recorded.events }
}

/** The bytes on the current index, moved there once if a save wrote them under the kernel's. */
export function oreBitsOf(ore: OreDiscoveries): OreBits {
  return {
    contacted: bitsOnCurrentIndex(ore.contacted, ore.codec),
    mined: bitsOnCurrentIndex(ore.mined, ore.codec),
  }
}

function bitsOnCurrentIndex(text: string, codec: string): Uint8Array {
  return oreBitsOnCurrentIndex(bytesOfBase64(text) ?? new Uint8Array(0), codec).bytes
}

function recordOreTouch(
  recorded: OreBits & { events: DomainEventBody[] },
  touch: OreTouch,
): OreBits & { events: DomainEventBody[] } {
  const bit = oreBitIndexOf(touch.ore)
  const contact = hasBit(recorded.contacted, bit) ? [] : contactEventsOf(touch)
  const isNewlyMined = touch.isMined && !hasBit(recorded.mined, bit)
  return {
    contacted: withBit(recorded.contacted, bit),
    mined: isNewlyMined ? withBit(recorded.mined, bit) : recorded.mined,
    events: [...recorded.events, ...contact, ...(isNewlyMined ? discoveryEventsOf(touch.ore) : [])],
  }
}

function contactEventsOf({ ore, via }: OreTouch): DomainEventBody[] {
  return [
    { type: 'codex.OreContacted', ...oreFactsOf(ore), via },
    { type: 'codex.EntryAdded', key: oreKeyOf(ore), stage: 'contacted' },
  ]
}

function discoveryEventsOf(ore: OreType): DomainEventBody[] {
  return [
    { type: 'codex.OreDiscovered', ...oreFactsOf(ore) },
    { type: 'codex.EntryAdded', key: oreKeyOf(ore), stage: 'mined' },
  ]
}

function oreDiscoveriesOfBits({ contacted, mined }: OreBits): OreDiscoveries {
  return {
    codec: oreIndexTag(),
    contacted: base64OfBytes(contacted),
    mined: base64OfBytes(mined),
  }
}
