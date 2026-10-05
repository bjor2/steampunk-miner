/** What the screens call the platform's two bays (#37) and the accent each wears (#45). */
import type { BayId } from '../world/dockBays'

export const BAY_NAMES: Readonly<Record<BayId, string>> = {
  sell: 'Sell bay',
  upgrade: 'Upgrade bay',
}

/** #45: one shared chrome; the Sell bay is copper and amber, the Upgrade bay steel and teal. */
export type BayAccent = 'copper' | 'teal'

export const BAY_ACCENTS: Readonly<Record<BayId, BayAccent>> = {
  sell: 'copper',
  upgrade: 'teal',
}
