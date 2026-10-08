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
 * cutters' Mark 3 hold cuts only the side the player steers toward (the GD ruling on #276); their
 * ladder ends at Mark 4, so it is their only milestone. Card lines are Content's check on #276.
 */
import { milestonesOf, type MarkMilestone, type MilestoneVerbs } from '../../tech-tree'
import type { DrillGearItem } from './drillGearItems'

const SAMPLING_CORER = 'gear.sampling_corer'

const VERBS: Readonly<Record<string, MilestoneVerbs>> = {
  'gear.spoil_auger': {
    hold: 'packs a deep plug behind you in one go',
    secondTap: 'packs one wide row further back in one go',
  },
  'gear.vibratory_bit': {
    siblingLink: {
      verb: 'cutting soft ground fires the sampling corer at half reach',
      siblingId: SAMPLING_CORER,
    },
  },
  [SAMPLING_CORER]: {
    secondTap: 'cores the nearest ore on either side of the bit',
    hold: 'cores the farthest ore in reach instead of the nearest',
  },
  'gear.side_cutters': {
    hold: "cuts only the side you're steering toward",
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
