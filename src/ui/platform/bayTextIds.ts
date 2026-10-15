/**
 * The text-budget ids of the bay frame's elements (spec #422, TD ruling on #424 Q3): the frame is
 * shared, so its header and footer count toward the Upgrade bay's panel there (`upgrade-bay.`,
 * pass #425) and toward the dock's at the Sell and Refinery bays (`dock.`, pass #427).
 */
import type { BayId } from '../../systems/world/dockBays'

export type BayFramePart = 'header' | 'footer'

export function bayFrameTextIdOf(bay: BayId, part: BayFramePart): string {
  const panel = bay === 'upgrade' ? 'upgrade-bay' : 'dock'
  return `${panel}.${part}`
}
