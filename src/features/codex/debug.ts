/**
 * Read-only, so no command and no log line (feature-slices.md 3.14): the local player's codex
 * section as the state holds it, so a browser spec reads discoveries through the debug API.
 */
import type { DebugAction } from '../../debug/debugActionRegistry'
import { readAuthorityState } from '../../store/authorityLink'
import { useGameStore } from '../../store/gameStore'
import { codexOf } from './systems/codexReads'

export const codexDebugActions: Readonly<Record<string, DebugAction>> = {
  getCodex: () => {
    const playerId = useGameStore.getState().playerId
    return { ok: true, playerId, codex: codexOf(readAuthorityState(), playerId) }
  },
}
