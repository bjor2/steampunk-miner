/**
 * The `Authority` seam (decision #3) and its in-process implementation for single-player.
 * Store actions submit commands here and render what the events say; a future co-op guest swaps
 * in a remote proxy with the same methods, and nothing above it changes.
 *
 * Commands are applied synchronously in submission order, and listeners hear each command's
 * events before `submit` (or `advanceTo`) returns.
 */
import type { AuthorityCommand } from './authorityCommand'
import type { AuthorityState } from './authorityState'
import { advanceTicks } from './advanceTicks'
import { applyCommand, type CommandOutcome } from './applyCommand'
import type { DomainEvent } from './domainEvent'
import { stateDigest } from './stateDigest'

export type DomainEventListener = (events: readonly DomainEvent[]) => void

export interface AuthoritySnapshot {
  tick: number
  state: AuthorityState
  /** FNV-1a 64 over the canonical JSON of `state`, 16 hex characters (#11). */
  digest: string
}

export interface Authority {
  submit(command: AuthorityCommand): void
  /** Moves the clock forward to `tick` with no command (fastForward, the fixed step). */
  advanceTo(tick: number): void
  /** Returns the call that stops listening. */
  subscribe(onEvents: DomainEventListener): () => void
  /**
   * The state now, unhashed: the frame and step loops read it many times a second, and hashing
   * the whole state on each read cost two-thirds of main-thread JS time (#101).
   */
  readState(): AuthorityState
  /** The state with its digest, for determinism checks; it hashes the whole state. */
  snapshot(): AuthoritySnapshot
}

export function createLoopbackAuthority(initialState: AuthorityState): Authority {
  let state = initialState
  const listeners = new Set<DomainEventListener>()

  const settle = (outcome: CommandOutcome): void => {
    state = outcome.state
    notifyListeners(listeners, outcome.events)
  }

  return {
    submit(command) {
      settle(applyCommand(state, command))
    },
    advanceTo(tick) {
      settle(advanceTicks(state, tick))
    },
    subscribe(onEvents) {
      listeners.add(onEvents)
      return () => listeners.delete(onEvents)
    },
    readState: () => state,
    snapshot: () => snapshotOf(state),
  }
}

export function snapshotOf(state: AuthorityState): AuthoritySnapshot {
  return { tick: state.tick, state, digest: stateDigest(state) }
}

function notifyListeners(listeners: Set<DomainEventListener>, events: readonly DomainEvent[]) {
  for (const onEvents of [...listeners]) onEvents(events)
}
