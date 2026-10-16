/**
 * How big a save grows (#470 P1-8, ticket 479): a phone's localStorage holds about 5 MB an origin,
 * and the file carries every chunk edit play made on the planet, so a long dig is the largest save.
 * The watch cuts the save file at each checkpoint moment on the planets it watches and keeps the
 * largest, in UTF-8 bytes as the shell stores it; the P200 money lane reads it on planets 1, 10
 * and 200 and prints it for `perf:record`.
 */
import type { AuthorityState } from '../authority/authorityState'
import type { DomainEvent } from '../authority/domainEvent'
import { takeSnapshot } from '../authority/sessionSnapshot'
import { isCheckpointMoment } from './checkpointMoment'
import { saveSlotOf } from './saveSlot'

export interface SaveBytesWatch {
  /** After each command's events, with the state they left. */
  note(state: AuthorityState, events: readonly DomainEvent[]): void
  /** The largest save seen on each watched planet that had a checkpoint moment. */
  largestBytesByPlanet(): ReadonlyMap<number, number>
}

export function watchSaveBytesOn(planets: readonly number[]): SaveBytesWatch {
  const largest = new Map<number, number>()
  return {
    note: (state, events) => {
      if (!planets.includes(state.planet.index) || !isCheckpointMoment(events)) return
      const bytes = saveBytesOf(state)
      largest.set(state.planet.index, Math.max(bytes, largest.get(state.planet.index) ?? 0))
    },
    largestBytesByPlanet: () => largest,
  }
}

/** The save the checkpoint would write now, as UTF-8 bytes; the epoch's digits change nothing here. */
export function saveBytesOf(state: AuthorityState): number {
  return new TextEncoder().encode(JSON.stringify(saveSlotOf(takeSnapshot(state), 1))).length
}
