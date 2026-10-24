/**
 * The casing burst in the scene (CG2, ticket 830): a `listenForDomainEvents` listener that hears
 * each `CollapseStarted` and throws the burst's sparks, cement puff and debris through the kernel's
 * `requestSpray`, which the always-on `SprayLayer` draws. Visual only: the refill is the kernel's
 * and never waits on it. What it threw is kept in `casingBurstPresence` for the debug reads.
 */
import { requestSpray } from '../store/sprayRequests'
import type { DomainEvent } from '../systems/authority/domainEvent'
import { burstPointOf, createBurstScratch, writeBurstSprays } from '../systems/render/casingBurst'

/** The bursts thrown so far and the block of the last, for the debug reads. */
export const casingBurstPresence = { fired: 0, lastBlock: null as string | null }

const scratch = createBurstScratch()

export function hearCasingBursts(events: readonly DomainEvent[]): void {
  events.forEach(throwBurstOf)
}

function throwBurstOf(event: DomainEvent): void {
  const point = burstPointOf(event)
  if (point === null || event.type !== 'CollapseStarted') return
  casingBurstPresence.fired += 1
  casingBurstPresence.lastBlock = event.block
  writeBurstSprays(scratch, point).forEach(requestSpray)
}
