/**
 * What the two bore-gun combos answer (ticket 320; TD lock 6180863028 on #320, GD ruling
 * 6180873822). Each answers only for a player who owns the combo and both its parent items (the
 * Scalers' pin: a combo resolves only with both parents owned), and each reads that player's own
 * latest bore, so in co-op the effect belongs to the owner's own shot.
 *
 * - **Winch bore** (the grapple's `reach`): while the player's latest bore line stands and is at
 *   most `hookWindowTicks` old (`min(60, line stands)`, about 32 ticks at least), the reach is
 *   lifted to the line's far end. The mobility lane spends the lift on that one open cell, inside
 *   the kernel's 12-cell `reachCellsMax`; movement only, no income.
 * - **Sounding bore** (`boreLineListeners`): the shot carries its opened cells on `BoreEnded`, and
 *   the sensing lane rings them at the echo sounder's Mark. Reveal only.
 *
 * The spotter guns' pre-train is a turret module, so it lives with the turret in the ground-gun
 * slice (`turretShapes.ts`).
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { boreFarEndOf } from '../../../systems/authority/bore/boreLine'
import { ownsItem } from '../../../systems/authority/loadoutRules'
import type { BoreLineListener } from '../../../systems/registries/boreLineListeners'
import type { ItemHookContext } from '../../../systems/registries/itemHooks'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { GROUND_GUN } from '../../ground-gun'
import { comboItemOf } from './comboCatalogue'

export const WINCH_BORE_ID = 'combo.winch_bore'
export const SOUNDING_BORE_ID = 'combo.sounding_bore'

export const SOUNDING_BORE_LINE: BoreLineListener = {
  id: 'combos.sounding_bore_line',
  wantsLine: (state, playerId) => isComboInPlay(state, playerId, SOUNDING_BORE_ID),
}

/** Tiles past the grapple's own range to the player's fresh bore's far end; null for none. */
export function winchBoreReachOf(
  state: AuthorityState,
  playerId: string,
  ctx: ItemHookContext,
): number | null {
  if (!isComboInPlay(state, playerId, WINCH_BORE_ID)) return null
  const farEnd = boreFarEndOf(state, playerId)
  if (farEnd === null || !isWithinHookWindow(ctx.tick, farEnd.firedTick)) return null
  return Math.max(0, tilesBetweenOf(ctx.origin, farEnd.tile) - ctx.magnitude)
}

/** Whether the player owns the combo and both its parent items: only then does it resolve. */
export function isComboInPlay(state: AuthorityState, playerId: string, itemId: string): boolean {
  const parents = comboItemOf(itemId)?.parentItemIds ?? []
  return [itemId, ...parents].every((owned) => ownsItem(state, playerId, owned))
}

function isWithinHookWindow(tick: number, firedTick: number): boolean {
  return tick - firedTick <= GROUND_GUN.combos[WINCH_BORE_ID].hookWindowTicks
}

/** The straight-line distance in whole tiles, rounded up so the far end is always inside. */
function tilesBetweenOf(from: TilePoint, to: TilePoint): number {
  const dx = to.tx - from.tx
  const dy = to.ty - from.ty
  return Math.ceil(Math.sqrt(dx * dx + dy * dy))
}
