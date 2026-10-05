/**
 * Moving the authority's clock without a command (#11 section 5, `fastForward`, and the live
 * fixed step). Besides the tick, the clock runs the enemy simulation and tows vehicles whose
 * strand grace or destroy delay runs out (`authorityClock.ts`), and takes the periodic state
 * digest every 3600 ticks (#11 section 3), each over the state as it stands at that tick, so a
 * replay that advances to the same ticks logs the same digests, fights and tows.
 */
import type { CommandOutcome } from './applyCommand'
import type { AuthorityState } from './authorityState'
import type { DomainEvent } from './domainEvent'
import { settleClockTo } from './authorityClock'
import { stateDigest } from './stateDigest'

/** One minute of fixed 1/60 s steps between periodic digests (#11 section 3). */
export const DIGEST_INTERVAL_TICKS = 3600

export function advanceTicks(state: AuthorityState, toTick: number): CommandOutcome {
  assertForwardTick(state.tick, toTick)
  const digested = periodicDigestTicks(state.tick, toTick).reduce(runClockToDigest, {
    state,
    events: [],
  })
  const settled = settleClockTo(digested.state, toTick)
  return {
    state: { ...settled.state, tick: toTick },
    events: [...digested.events, ...settled.events],
  }
}

/** The clock's changes due at or before a digest tick happen first, so the digest sees them. */
function runClockToDigest(outcome: CommandOutcome, digestTick: number): CommandOutcome {
  const settled = settleClockTo(outcome.state, digestTick)
  return {
    state: settled.state,
    events: [...outcome.events, ...settled.events, digestAt(settled.state, digestTick)],
  }
}

function assertForwardTick(fromTick: number, toTick: number): void {
  if (!Number.isSafeInteger(toTick) || toTick < fromTick) {
    throw new RangeError(`the authority moves forward only: ${fromTick} -> ${toTick}`)
  }
}

/** Multiples of the interval in (fromTick, toTick]. */
function periodicDigestTicks(fromTick: number, toTick: number): number[] {
  const ticks: number[] = []
  const first = (Math.floor(fromTick / DIGEST_INTERVAL_TICKS) + 1) * DIGEST_INTERVAL_TICKS
  for (let tick = first; tick <= toTick; tick += DIGEST_INTERVAL_TICKS) ticks.push(tick)
  return ticks
}

function digestAt(state: AuthorityState, tick: number): DomainEvent {
  return { tick, type: 'StateDigested', digest: stateDigest({ ...state, tick }), scope: 'periodic' }
}
