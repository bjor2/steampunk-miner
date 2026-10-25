/**
 * The carried crate a drop spends (ticket 850; the note on #850 from #823's resolution): a
 * container whose kind is a consumable kit item (the Cache Crate) is dropped from one carried
 * unit, the one of the lowest g it was bought at, and refused `no_crate` while none is carried. A
 * kind no kit item names spends nothing.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { rejectionOf, type Rejection } from '../../../systems/authority/commandRule'
import { heldCountOf, spendConsumable } from './kitHoldings'
import { kitHoldingsOf, withKitHoldings } from './kitHoldingsSection'
import { PLANET_KITS } from './planetKitRows'
import { kitItemOf } from './planetKitSales'

/** The player's holdings less one carried unit of the kind's kit item, when it is one. */
export function withCrateSpent(
  state: AuthorityState,
  playerId: string,
  kind: string,
): AuthorityState {
  const spend = spendConsumable(kitHoldingsOf(state, playerId), kind)
  return spend === null ? state : withKitHoldings(state, playerId, spend.holdings)
}

export function noCrateRejection(
  state: AuthorityState,
  playerId: string,
  kind: string,
): Rejection | null {
  if (!isCarriedKind(kind) || heldCountOf(kitHoldingsOf(state, playerId), kind) > 0n) return null
  return rejectionOf('planet-kit.no_crate', `the player carries no ${kind}`)
}

/** Whether a container of `kind` is dropped from a carried kit item, spent on the drop. */
function isCarriedKind(kind: string): boolean {
  return kitItemOf(PLANET_KITS, kind)?.kind === 'consumable'
}
