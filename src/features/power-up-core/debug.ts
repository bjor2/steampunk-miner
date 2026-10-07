/**
 * The power-up debug actions (feature-slices.md 3.14): `getSlots` and `getCharges` read what the
 * slot column and the authority hold, so a browser spec asserts state, never pixels;
 * `setCharges` submits `debug.power-up-core.setCharges`, so it replays and logs
 * `debug_command_applied`.
 */
import type { DebugAction } from '../../debug/debugActionRegistry'
import { submitSliceDebugCommand } from '../../debug/sliceDebugCommands'
import { readAuthorityState } from '../../store/authorityLink'
import { useGameStore } from '../../store/gameStore'
import { chargesLeftOf } from './systems/chargeState'
import { slotButtonsOf } from './systems/slotColumn'

export const powerUpCoreDebugActions: Readonly<Record<string, DebugAction>> = {
  getSlots: () => ({ ok: true, slots: slotButtonsOf(readAuthorityState(), localPlayerId()) }),
  getCharges: (itemId) => ({
    ok: true,
    chargesLeft: chargesLeftOf(readAuthorityState(), localPlayerId(), String(itemId)),
  }),
  setCharges: (itemId, chargesLeft) =>
    submitSliceDebugCommand({
      type: 'debug.power-up-core.setCharges',
      payload: { itemId: itemId as string, chargesLeft: chargesLeft as number },
    }),
}

function localPlayerId(): string {
  return useGameStore.getState().playerId
}
