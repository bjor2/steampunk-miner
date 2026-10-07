/**
 * The power-up debug actions (feature-slices.md 3.14): `getSlots` and `getCharges` read what the
 * slot column and the authority hold, so a browser spec asserts state, never pixels;
 * `setCharges` submits `debug.power-up-core.setCharges`, so it replays and logs
 * `debug_command_applied`. `holdSlot` submits the player's `hold_power_up` as a held slot key
 * would (#256), since no key sends it yet.
 */
import type { DebugAction } from '../../debug/debugActionRegistry'
import type { DebugResult } from '../../debug/debugScreens'
import { submitSliceDebugCommand } from '../../debug/sliceDebugCommands'
import { readAuthorityState } from '../../store/authorityLink'
import { useGameStore } from '../../store/gameStore'
import { chargesLeftOf } from './systems/chargeState'
import { isPowerUpSlot } from './systems/powerUpSlots'
import { slotButtonsOf } from './systems/slotColumn'
import { intentToHoldSlot } from './systems/slotUse'

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
  holdSlot: (slot) => submitHold(String(slot)),
}

function submitHold(slot: string): DebugResult {
  if (!isPowerUpSlot(slot)) return { ok: false, problems: [`"${slot}" is not a power-up slot`] }
  useGameStore.getState().submitPlayerIntent(intentToHoldSlot(slot))
  return { ok: true }
}

function localPlayerId(): string {
  return useGameStore.getState().playerId
}
