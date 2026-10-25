/**
 * The merchant panel as the local player's replica holds it now, for the Sell bay's panel and the
 * debug read: the same function on the same state, so a spec reads what is drawn.
 */
import { readAuthorityState } from '../../../store/authorityLink'
import { merchantPanelOf, type MerchantPanelView } from '../systems/merchantPanel'
import { PLANET_KITS } from '../systems/planetKitRows'

export function readMerchantPanel(): MerchantPanelView | null {
  return merchantPanelOf(PLANET_KITS, readAuthorityState())
}
