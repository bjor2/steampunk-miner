/**
 * The `Authority` seam (decision #3) and its in-process implementation for single-player.
 * Store actions submit commands here and render what the events say; a future co-op guest swaps
 * in a remote proxy with the same three methods, and nothing above it changes.
 *
 * Commands are applied synchronously in submission order, and listeners hear each command's
 * events before `submit` returns.
 */
import type { AuthorityCommand } from './authorityCommand'
import type { AuthorityState } from './authorityState'
import { applyCommand } from './applyCommand'
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
  /** Returns the call that stops listening. */
  subscribe(onEvents: DomainEventListener): () => void
  snapshot(): AuthoritySnapshot
}

export function createLoopbackAuthority(initialState: AuthorityState): Authority {
  let state = initialState
  const listeners = new Set<DomainEventListener>()

  return {
    submit(command) {
      const outcome = applyCommand(state, command)
      state = outcome.state
      notifyListeners(listeners, outcome.events)
    },
    subscribe(onEvents) {
      listeners.add(onEvents)
      return () => listeners.delete(onEvents)
    },
    snapshot: () => snapshotOf(state),
  }
}

export function snapshotOf(state: AuthorityState): AuthoritySnapshot {
  return { tick: state.tick, state, digest: stateDigest(state) }
}

function notifyListeners(listeners: Set<DomainEventListener>, events: readonly DomainEvent[]) {
  for (const onEvents of [...listeners]) onEvents(events)
}
