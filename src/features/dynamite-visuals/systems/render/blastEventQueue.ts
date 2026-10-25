/**
 * The blast events the front layer draws on its next frame (#215; D8 ticket 868): each `BlastFront`
 * slice (K6 #189), each `BlastStarted` as the blast the stages play (its disc record, the ground
 * radius its `ChargeDetonated` carries, and what the feed answers: the look's seed from the blast's
 * number, the broken ground's colour, whether this is the size's showcase), and each collapse fall
 * the feed found, copied into fixed records so hearing and drawing allocate nothing. A batch with
 * more than the queue holds drops the rest; the look is presentation only, so a dropped front is a
 * thinner ring, never a wrong world. A `ChargesRestocked` is told to the answers, for the showcase.
 */
import type { DomainEvent } from '../../../../systems/authority/domainEvent'
import { chargeRadiusMm } from '../../../../systems/economy/chargeSizes'
import type { ChargeDetonatedEvent } from '../../../../systems/registries/chargeBlastCue'
import type { Rgb } from '../../../../systems/render/colour'
import type { CollapseFall } from './blastCollapseFall'
import { blastRadiusMmOf } from './blastCueProvider'

export interface QueuedFront {
  tx: number
  ty: number
  rInnerMm: number
  rOuterMm: number
}

/** One detonation's blast as the stages play it. */
export interface QueuedBlast {
  tx: number
  ty: number
  size: number
  chargeType: number
  radiusLevel: number
  blastSeq: number
  tick: number
  groundRadiusMm: number
  casingLaid: boolean
  /** `hash(planetSeed, blastSeq)`: every spark of the blast draws from it. */
  seed: number
  isShowcase: boolean
  /** The broken ground's colour, written in place. */
  groundColour: [number, number, number]
}

export type QueuedFall = CollapseFall

/** What the feed answers about a blast that the events alone do not say. */
export interface BlastQueueAnswers {
  seedOf(blastSeq: number): number
  groundColourOf(tx: number, ty: number): Rgb
  /** Whether a blast of `size` is its showcase; asked once per blast, in event order. */
  isShowcaseOf(size: number): boolean
  /** A purchase of `size`, for the showcase ledger. */
  noticePurchase(size: number): void
}

export interface BlastEventQueue {
  fronts: QueuedFront[]
  frontCount: number
  blasts: QueuedBlast[]
  blastCount: number
  falls: QueuedFall[]
  fallCount: number
  /** This batch's detonations, so a `BlastStarted` finds the ground radius said beside it. */
  detonated: { tx: number; ty: number; radiusMm: number }[]
  detonatedCount: number
}

export function createBlastEventQueue(capacity: number, fallCapacity = capacity): BlastEventQueue {
  return {
    fronts: Array.from({ length: capacity }, () => ({ tx: 0, ty: 0, rInnerMm: 0, rOuterMm: 0 })),
    frontCount: 0,
    blasts: Array.from({ length: capacity }, emptyBlast),
    blastCount: 0,
    falls: Array.from({ length: fallCapacity }, () => ({ x0: 0, y0: 0, sizeM: 0 })),
    fallCount: 0,
    detonated: Array.from({ length: capacity }, () => ({ tx: 0, ty: 0, radiusMm: 0 })),
    detonatedCount: 0,
  }
}

export function queueBlastEvents(
  queue: BlastEventQueue,
  events: readonly DomainEvent[],
  answers: BlastQueueAnswers,
): void {
  queue.detonatedCount = 0
  for (const event of events) queueBlastEvent(queue, event, answers)
}

/** The falls the feed found this batch. */
export function queueFalls(queue: BlastEventQueue, falls: readonly CollapseFall[]): void {
  for (const fall of falls) queueFall(queue, fall)
}

/** Forgets what was drawn, for the next frame. */
export function clearBlastEventQueue(queue: BlastEventQueue): void {
  queue.frontCount = 0
  queue.blastCount = 0
  queue.fallCount = 0
}

function emptyBlast(): QueuedBlast {
  return {
    tx: 0,
    ty: 0,
    size: 1,
    chargeType: 1,
    radiusLevel: 0,
    blastSeq: 0,
    tick: 0,
    groundRadiusMm: 0,
    casingLaid: false,
    seed: 0,
    isShowcase: false,
    groundColour: [0, 0, 0],
  }
}

function queueBlastEvent(
  queue: BlastEventQueue,
  event: DomainEvent,
  answers: BlastQueueAnswers,
): void {
  if (event.type === 'BlastFront') queueFront(queue, event)
  if (event.type === 'ChargeDetonated') noteDetonation(queue, event)
  if (event.type === 'BlastStarted') queueBlast(queue, event, answers)
  if (event.type === 'ChargesRestocked') answers.noticePurchase(event.size)
}

function queueFront(queue: BlastEventQueue, front: QueuedFront): void {
  if (queue.frontCount === queue.fronts.length) return
  const record = queue.fronts[queue.frontCount++]
  record.tx = front.tx
  record.ty = front.ty
  record.rInnerMm = front.rInnerMm
  record.rOuterMm = front.rOuterMm
}

function noteDetonation(queue: BlastEventQueue, detonated: ChargeDetonatedEvent): void {
  if (queue.detonatedCount === queue.detonated.length) return
  const record = queue.detonated[queue.detonatedCount++]
  record.tx = detonated.tx
  record.ty = detonated.ty
  record.radiusMm = blastRadiusMmOf(detonated)
}

type BlastStarted = Extract<DomainEvent, { type: 'BlastStarted' }>

function queueBlast(
  queue: BlastEventQueue,
  started: BlastStarted,
  answers: BlastQueueAnswers,
): void {
  const isShowcase = answers.isShowcaseOf(started.size)
  if (queue.blastCount === queue.blasts.length) return
  const record = queue.blasts[queue.blastCount++]
  record.tx = started.tx
  record.ty = started.ty
  record.size = started.size
  record.chargeType = started.chargeType
  record.radiusLevel = started.radiusLevel
  record.blastSeq = started.blastSeq
  record.tick = started.tick
  record.groundRadiusMm = groundRadiusOfBatch(queue, started)
  record.casingLaid = started.casingLaid
  record.seed = answers.seedOf(started.blastSeq)
  record.isShowcase = isShowcase
  const [r, g, b] = answers.groundColourOf(started.tx, started.ty)
  record.groundColour[0] = r
  record.groundColour[1] = g
  record.groundColour[2] = b
}

/** The ground radius the batch's detonation at the tile said; the rung's own when none did. */
function groundRadiusOfBatch(queue: BlastEventQueue, started: BlastStarted): number {
  for (let at = 0; at < queue.detonatedCount; at++) {
    const detonated = queue.detonated[at]
    if (detonated.tx === started.tx && detonated.ty === started.ty) return detonated.radiusMm
  }
  return chargeRadiusMm(started.size)
}

function queueFall(queue: BlastEventQueue, fall: CollapseFall): void {
  if (queue.fallCount === queue.falls.length) return
  const record = queue.falls[queue.fallCount++]
  record.x0 = fall.x0
  record.y0 = fall.y0
  record.sizeM = fall.sizeM
}
