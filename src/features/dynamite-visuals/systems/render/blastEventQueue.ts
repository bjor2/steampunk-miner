/**
 * The blast events the front layer draws on its next frame (#215): each `BlastFront` slice (K6
 * #189) and each `ChargeDetonated` (its flash), copied out of the authority's batch into fixed
 * records, so hearing and drawing allocate nothing. A batch with more than the queue holds drops
 * the rest; the look is presentation only, so a dropped front is a thinner ring, never a wrong world.
 */
import type { DomainEvent } from '../../../../systems/authority/domainEvent'
import type { ChargeDetonatedEvent } from '../../../../systems/registries/chargeBlastCue'
import { blastRadiusMmOf } from './blastCueProvider'

export interface QueuedFront {
  tx: number
  ty: number
  rInnerMm: number
  rOuterMm: number
}

export interface QueuedFlash {
  tx: number
  ty: number
  size: number
  radiusMm: number
}

export interface BlastEventQueue {
  fronts: QueuedFront[]
  frontCount: number
  flashes: QueuedFlash[]
  flashCount: number
}

export function createBlastEventQueue(capacity: number): BlastEventQueue {
  return {
    fronts: Array.from({ length: capacity }, () => ({ tx: 0, ty: 0, rInnerMm: 0, rOuterMm: 0 })),
    frontCount: 0,
    flashes: Array.from({ length: capacity }, () => ({ tx: 0, ty: 0, size: 1, radiusMm: 0 })),
    flashCount: 0,
  }
}

export function queueBlastEvents(queue: BlastEventQueue, events: readonly DomainEvent[]): void {
  for (const event of events) queueBlastEvent(queue, event)
}

/** Forgets what was drawn, for the next frame. */
export function clearBlastEventQueue(queue: BlastEventQueue): void {
  queue.frontCount = 0
  queue.flashCount = 0
}

function queueBlastEvent(queue: BlastEventQueue, event: DomainEvent): void {
  if (event.type === 'BlastFront') queueFront(queue, event)
  if (event.type === 'ChargeDetonated') queueFlash(queue, event)
}

function queueFront(queue: BlastEventQueue, front: QueuedFront): void {
  if (queue.frontCount === queue.fronts.length) return
  const record = queue.fronts[queue.frontCount++]
  record.tx = front.tx
  record.ty = front.ty
  record.rInnerMm = front.rInnerMm
  record.rOuterMm = front.rOuterMm
}

function queueFlash(queue: BlastEventQueue, detonated: ChargeDetonatedEvent): void {
  if (queue.flashCount === queue.flashes.length) return
  const record = queue.flashes[queue.flashCount++]
  record.tx = detonated.tx
  record.ty = detonated.ty
  record.size = detonated.size
  record.radiusMm = blastRadiusMmOf(detonated)
}
