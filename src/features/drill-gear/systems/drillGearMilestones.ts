/**
 * The drill gear's Mark milestones (the GD lock on #256, build 5): the class table's pattern at
 * Marks 3, 6 and 9 of each shipped item's ladder, with the verb its card line names. No drill gear
 * moves ore. A ladder that ends before a milestone's Mark has none there: the reach boom, the thaw
 * crown and the twin bit end at Mark 1, the vibratory bit and the side cutters at Mark 4.
 *
 * A link needs a sibling with charges that can sit in another socket at the same time (a toggle
 * counts none and never fires, ticket 274). The lane's only charged item is the sampling corer in
 * the collar, so the vibratory bit (in the head) links to it, while the corer and the spoil auger
 * (also a collar part) have no sibling to fire: their Mark 9 stays a number step. The side
 * cutters' Mark 3 hold (the lock's "cuts the faced side only") waits for a one-sided ask on the
 * kernel's drill gear read, so it is not authored yet.
 */
import { milestonesOf, type MarkMilestone, type MilestoneVerbs } from '../../tech-tree'
import type { DrillGearItem } from './drillGearItems'

const SAMPLING_CORER = 'gear.sampling_corer'

const VERBS: Readonly<Record<string, MilestoneVerbs>> = {
  'gear.spoil_auger': {
    hold: 'packs a plug three rows deep behind you at once',
    secondTap: 'packs a row five tiles wide, a metre further back, at once',
  },
  'gear.vibratory_bit': {
    siblingLink: { verb: 'each crumble cores ahead at half reach', siblingId: SAMPLING_CORER },
  },
  [SAMPLING_CORER]: {
    secondTap: 'cores the first ore beside the bit',
    hold: 'draws the plug from the farthest ore in reach',
  },
}

/** The item's milestones: its class's pattern at each Mark it has a verb for. */
export function drillGearMilestonesOf(item: DrillGearItem): MarkMilestone[] {
  const verbs = VERBS[item.itemId]
  return verbs === undefined ? [] : milestonesOf(classOf(item), verbs)
}

/** #256's classes: the corer is charged, a toggle is a toggle, a bit always on is always-on. */
function classOf(item: DrillGearItem) {
  if (item.powerUpClass === 'charged') return 'charged'
  return item.isToggle ? 'toggle' : 'always-on'
}
