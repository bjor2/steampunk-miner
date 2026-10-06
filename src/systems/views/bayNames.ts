/** What the screens call the platform's bays (#37, #105) and the accent each wears (#45). */
import type { PlatformBayId } from '../authority/platformState'

export const BAY_NAMES: Readonly<Record<PlatformBayId, string>> = {
  sell: 'Sell bay',
  upgrade: 'Upgrade bay',
  refinery: 'Refinery bay',
}

/**
 * #45: one shared chrome; the Sell bay is copper and amber, the Upgrade bay steel and teal, and
 * the Refinery bay ember and brass (#105).
 */
export type BayAccent = 'copper' | 'teal' | 'ember'

export const BAY_ACCENTS: Readonly<Record<PlatformBayId, BayAccent>> = {
  sell: 'copper',
  upgrade: 'teal',
  refinery: 'ember',
}
