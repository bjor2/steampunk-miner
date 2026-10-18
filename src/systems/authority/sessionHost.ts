/**
 * Who may change a shared session's world rules (ticket 547, the TD ruling on #547: "multiplayer:
 * the host only"; host-authoritative co-op, #3): the host, which the authority reads as the
 * session's lowest player id. A replay rebuilds its players from the command log's ids sorted
 * (`replay/replayRun.ts`), so the same player is the host live and on every replay, and the rule
 * needs no state of its own. A single-player session's one player is always its host. Co-op's
 * join flow gives the host the lowest id (`player_1`, guests after it).
 */
import type { AuthorityState } from './authorityState'

export function isSessionHost(state: AuthorityState, playerId: string): boolean {
  return playerId === hostIdOf(state)
}

function hostIdOf(state: AuthorityState): string {
  return Object.keys(state.players).sort()[0]
}
