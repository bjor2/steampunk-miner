/**
 * The domain events and refusal reasons the mobility lane adds (feature-slices.md 3.15), by
 * augmentation, never by editing the kernel's lists. `power-up-core` already logs every use, so
 * these say only what the use did that its line cannot: where a grapple hooked, and how a rivet
 * patch ended.
 *
 * Every event names its player: the patch ends on the authority clock, whose events carry no
 * command stamp.
 */
import { toCanonical, type BigStat } from '../../../systems/money'
import type { TilePoint } from '../../../systems/world/tileGrid'

declare module '../../../systems/authority/domainEvent' {
  interface DomainEventBodies {
    /** The hook bit a cell (gated and core cells too: it never breaks one) and the reel began. */
    'mobility.GrappleHooked': {
      playerId: string
      hookTx: number
      hookTy: number
      /** The open tile beside the hook the winch hauls the miner to. */
      toTx: number
      toTy: number
    }
    /** The rivet patch held still for its whole hold and plated the hull. */
    'mobility.HullPatched': { playerId: string; amount: string; hullAfter: string }
    /** The miner moved during the hold: no hull, and the unit came back. */
    'mobility.PatchCancelled': { playerId: string; chargesLeft: number }
  }
}

/** Why a grapple press found nothing to act on (`power_up_refused.reason`). */
export const NO_HOOK = 'mobility.no_hook'

export function grappleHookedOf(playerId: string, hook: TilePoint, to: TilePoint) {
  return {
    type: 'mobility.GrappleHooked' as const,
    playerId,
    hookTx: hook.tx,
    hookTy: hook.ty,
    toTx: to.tx,
    toTy: to.ty,
  }
}

export function hullPatchedOf(playerId: string, amount: BigStat, hullAfter: BigStat) {
  return {
    type: 'mobility.HullPatched' as const,
    playerId,
    amount: toCanonical(amount),
    hullAfter: toCanonical(hullAfter),
  }
}

export function patchCancelledOf(playerId: string, chargesLeft: number) {
  return { type: 'mobility.PatchCancelled' as const, playerId, chargesLeft }
}
