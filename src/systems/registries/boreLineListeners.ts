/**
 * Listeners for a bore shot's opened cells (K-line, ticket 412, the TD lock 6180863028 on #320
 * and the GD ruling 6180873822): a slice that draws something along a bored line (the sounding
 * bore's echo) asks here, and the kernel puts the shot's cells on its last `BoreEnded` as
 * `lineCells` only while one listener answers true. With none registered, or none answering, the
 * event, its `bore_ended` row and every digest are the ones they were before the field existed.
 *
 * Like item hooks, a listener never registers an unlock id: the seal refuses an id naming a row of
 * the locked schedule (#146).
 */
import type { AuthorityState } from '../authority/authorityState'
import { LOCKED_SCHEDULE, unlockIdNamedIn } from '../unlocks/unlockSchedule'
import { defineRegistry, entriesOf, type SealedRegistration } from './seal'

export interface BoreLineListener {
  id: string
  /** Whether this player's shot should carry its opened cells; asked once, as the shot ends. */
  wantsLine(state: AuthorityState, playerId: string): boolean
}

export const BORE_LINE_LISTENER_REGISTRY = defineRegistry<BoreLineListener>(
  'boreLineListeners',
  listenerSealProblemOf,
)

/** True when any listener, in id order, wants this player's shot to carry its cells. */
export function isBoreLineWanted(state: AuthorityState, playerId: string): boolean {
  return entriesOf(BORE_LINE_LISTENER_REGISTRY).some((listener) =>
    listener.wantsLine(state, playerId),
  )
}

/** Every listener whose id names an unlock row; null when none does. */
function listenerSealProblemOf(
  registrations: readonly SealedRegistration<BoreLineListener>[],
): string | null {
  const problems = registrations.flatMap(({ entry }) => unlockProblemsOf(entry))
  return problems.length === 0 ? null : problems.join('; ')
}

function unlockProblemsOf(listener: BoreLineListener): string[] {
  const unlockId = unlockIdNamedIn(LOCKED_SCHEDULE, listener.id)
  return unlockId === undefined ? [] : [`"${listener.id}" names the unlock id "${unlockId}"`]
}
