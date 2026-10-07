/**
 * The fourth power-up cradle's node on this lane (#161 section 1, ticket 251 from the #157 gap
 * review): `tech.terrain.cradle_4` at P20 after the pressure pocket lance, unlocking
 * `slot.powerup_4`. The item, its sale and its card are `power-up-core`'s; this lane owns only the
 * node, as the mobility lane owns the third's. A cradle is both vertical and horizontal (#162
 * "Labels"), and it claims no schedule row, so it never previews a vision-row feature.
 */
import type { TechNode } from '../../tech-tree'

/** The shipped slots-panel icon, as the third cradle's node shows it until #166 draws them. */
const CRADLE_ICON_ID = 'icon-panel-slots'

export const FOURTH_CRADLE_NODE: TechNode = {
  id: 'tech.terrain.cradle_4',
  iconId: CRADLE_ICON_ID,
  lane: 'terrain',
  name: 'Fourth power-up cradle',
  unlockTier: 20,
  prereqs: ['tech.terrain.pressure_pocket'],
  unlocks: 'slot.powerup_4',
  description: 'Another sprung cradle on the deck for one more gadget below.',
  label: 'both',
  costKind: 'slot',
}
