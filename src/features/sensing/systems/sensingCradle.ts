/**
 * The fifth power-up cradle's node on this lane (#161 section 1, ticket 251 from the #157 gap
 * review): `tech.sensing.cradle_5` at P30 after the signal buoy, unlocking `slot.powerup_5`. The
 * item, its sale and its card are `power-up-core`'s; this lane owns only the node, as the mobility
 * lane owns the third's. A cradle is both vertical and horizontal (#162 "Labels"), and it claims no
 * schedule row, so it never previews a vision-row feature.
 */
import type { TechNode } from '../../tech-tree'

/** The shipped slots-panel icon, as the third cradle's node shows it until #166 draws them. */
const CRADLE_ICON_ID = 'icon-panel-slots'

export const FIFTH_CRADLE_NODE: TechNode = {
  id: 'tech.sensing.cradle_5',
  iconId: CRADLE_ICON_ID,
  lane: 'sensing',
  name: 'Fifth power-up cradle',
  unlockTier: 30,
  prereqs: ['tech.sensing.signal_buoy'],
  unlocks: 'slot.powerup_5',
  description: 'The last cradle the deck can bear, for one more instrument below.',
  label: 'both',
  costKind: 'slot',
}
