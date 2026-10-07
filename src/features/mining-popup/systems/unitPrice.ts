/**
 * The plaque's "sells for ~X each" (TD on #178, Systems): the gross per-unit price the Sell bay
 * pays this player for the tier on the current planet, as `Money`, with no bill taken off, and
 * formatted once. Never through a double (noDoubleConversion.test.ts guards the slice).
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { sellBayUnitPrice } from '../../../systems/authority/platformServices'
import { formatAmount } from '../../../systems/displayAmount'

export function unitPriceTextOf(state: AuthorityState, playerId: string, tier: number): string {
  return formatAmount(sellBayUnitPrice(state, playerId, tier))
}
