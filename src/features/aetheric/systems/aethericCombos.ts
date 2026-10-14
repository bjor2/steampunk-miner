/**
 * The aetheric pair combos this slice plays (ticket 373: Content's definitions and the GD ruling of
 * 14 Oct). The combos slice registers each one's store item, template, card and sale; what the
 * combo does lives here, beside the aetheric parent it changes, because only this slice keeps the
 * whistle's, the pocket's and the item gauge's state. Each adds a verb, never yield, rig speed or
 * a resource, and reads the same at every grade: none has a headroom to close (`comboGrades.ts`).
 *
 * A combo resolves only while the player owns it and both its parent items (the Horizontal
 * Scaler's ownership rule), each read for that player alone. A combo that presses an item for the
 * player waits out the #328 manual-press gap (Gameplay, #206 combo lock) the way the auto core's
 * own actors do: only once no use of the player's is pending and the item's cooldown, which a press
 * by hand restarts, has run out (`autoUseReadyTickOf`). A press the player just made is never taken.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { ownsItem } from '../../../systems/authority/loadoutRules'
import { comboItemOf } from '../../combos'
import { autoUseReadyTickOf } from '../../power-up-core'

export const STILL_FOAM_ID = 'combo.still_foam'
export const WARNING_CHIME_ID = 'combo.warning_chime'
export const PENDULUM_ANCHOR_ID = 'combo.pendulum_anchor'
export const QUENCH_CUTTERS_ID = 'combo.quench_cutters'

/** The four this slice plays; the lull line is held until the tether's lump has a cell. */
export const AETHERIC_COMBO_IDS: readonly string[] = [
  STILL_FOAM_ID,
  WARNING_CHIME_ID,
  PENDULUM_ANCHOR_ID,
  QUENCH_CUTTERS_ID,
]

/** Whether `playerId` owns the combo and both its parent items now. */
export function isComboInPlay(state: AuthorityState, playerId: string, comboId: string): boolean {
  if (!Object.hasOwn(state.players, playerId)) return false
  return itemsNeededFor(comboId).every((itemId) => ownsItem(state, playerId, itemId))
}

/** Whether a combo may press `itemId` for the player at `tick`: past the #328 gap. */
export function isPastPressGap(
  state: AuthorityState,
  playerId: string,
  itemId: string,
  tick: number,
): boolean {
  const readyTick = autoUseReadyTickOf(state, playerId, itemId)
  return readyTick !== null && tick >= readyTick
}

/** The combo and its two parent items; nothing to own for an id that is no combo. */
function itemsNeededFor(comboId: string): readonly string[] {
  const combo = comboItemOf(comboId)
  return combo === null ? [comboId] : [combo.itemId, ...combo.parentItemIds]
}
