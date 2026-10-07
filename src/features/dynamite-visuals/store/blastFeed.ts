/**
 * The blast events the front layer draws next frame: the authority's, heard through
 * `listenForDomainEvents`, and a debug preview's, one frame at a time. A fixed queue in module
 * scope, so hearing and drawing allocate nothing; presentation only, nothing here reaches the
 * authority, the store or the log.
 */
import { vehiclePresence } from '../../../scene/vehiclePresence'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { chargeRadiusMm } from '../../../systems/economy/chargeSizes'
import {
  clearBlastEventQueue,
  createBlastEventQueue,
  queueBlastEvents,
  type BlastEventQueue,
} from '../systems/render/blastEventQueue'
import { QUEUED_BLAST_EVENTS } from '../systems/render/blastLookConstants'
import { previewBlastFrames } from '../systems/render/blastPreview'

const feed = createBlastEventQueue(QUEUED_BLAST_EVENTS)
let previewFrames: DomainEvent[][] = []

/** A `listenForDomainEvents` listener. */
export function hearBlastEvents(events: readonly DomainEvent[]): void {
  queueBlastEvents(feed, events)
}

/** This frame's events: the authority's since the last frame, and the preview's next frame. */
export function takeBlastFeed(): BlastEventQueue {
  const frame = previewFrames.shift()
  if (frame !== undefined) queueBlastEvents(feed, frame)
  return feed
}

/** Forgets what the layer drew this frame. */
export function clearBlastFeed(): void {
  clearBlastEventQueue(feed)
}

/** Plays a size's blast at the vehicle's tile, a slice a frame; nothing in the world changes. */
export function previewBlastAtVehicle(size: number): void {
  // A tile is a metre (#4), so the vehicle's tile is its drawn position floored.
  const at = { tx: Math.floor(vehiclePresence.x), ty: Math.floor(vehiclePresence.y) }
  previewFrames = previewBlastFrames(at, size, chargeRadiusMm(size))
}
