/** What the screens call the platform's two bays (#37). */
import type { BayId } from '../world/dockBays'

export const BAY_NAMES: Readonly<Record<BayId, string>> = {
  sell: 'Sell bay',
  upgrade: 'Upgrade bay',
}
