/**
 * Who owns the world save (#401 Horizontal Scaler 4, ticket 407; host-authoritative co-op, #3).
 * The host runs the world's authority and alone writes its save: unlocks, owned items, artefact
 * picks, firsts, the planet and every player's money and vehicle. A guest plays in the host's world
 * as the host's save holds it and never writes a world save of their own, so nothing of the host's
 * world can reach the guest's slots, and nothing of the guest's can reach the host's.
 *
 * Single-player is the host of its own world. What a player keeps between worlds is their profile
 * (`playerProfile.ts`).
 */

export type SaveRole = 'host' | 'guest'

/** Where a joined world's save came from, as `checkpoint_loaded` names it. */
export const HOST_WORLD_SAVE = 'host'

/** Why this player may not write the world save now; empty when they may. */
export function worldSaveWriteProblems(role: SaveRole): string[] {
  if (role === 'host') return []
  return ['a guest never writes a world save: the host owns the world it joined']
}

export function canWriteWorldSave(role: SaveRole): boolean {
  return worldSaveWriteProblems(role).length === 0
}
