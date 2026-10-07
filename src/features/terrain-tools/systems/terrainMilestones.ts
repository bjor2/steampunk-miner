/**
 * The terrain tools' Mark milestones (the GD lock on #256, build 5): the class table's pattern at
 * Marks 3, 6 and 9 of each shipped tool's ladder, with the verb its card line names. Every tool is
 * an income item, so its second tap and hold change only where or how it works, and its
 * sibling-link is its one yield step. A ladder that ends before Mark 9 has no link: the seam
 * splitter's ends at Mark 6 and the lodestone beacon's at Mark 7.
 *
 * The ore-shifter's verbs are the lock's worked example; the others are this ticket's picks, each
 * a where or a how of the same edit.
 */
import { milestonesOf, type MarkMilestone, type MilestoneVerbs } from '../../tech-tree'

const ORE_SHIFTER = 'power.ore_shifter'
const SEAM_SPLITTER = 'consumable.seam_splitter'
const PRESSURE_POCKET = 'power.pressure_pocket'
const LODESTONE_BEACON = 'consumable.lodestone_beacon'

const VERBS: Readonly<Record<string, MilestoneVerbs>> = {
  [ORE_SHIFTER]: {
    secondTap: 'pushes the same nodules away from the hull',
    hold: 'drags only from the side you face',
    siblingLink: {
      verb: 'plants a lodestone beacon at half its swap cap',
      siblingId: LODESTONE_BEACON,
    },
  },
  [SEAM_SPLITTER]: {
    secondTap: 'splits across the face, a quarter turn from the facing',
    hold: 'splits straight along the facing, ignoring the grain',
  },
  [PRESSURE_POCKET]: {
    secondTap: 'blows the pocket behind you',
    hold: 'blows the pocket above you',
    siblingLink: {
      verb: 'opens a seam splitter fissure at half length',
      siblingId: SEAM_SPLITTER,
    },
  },
  [LODESTONE_BEACON]: {
    secondTap: 'throws the beacon one gather radius ahead',
    hold: 'sinks the beacon one gather radius below you',
  },
}

/** The tool's milestones: its class's pattern at each Mark it has a verb for; none for a held one. */
export function terrainMilestonesOf(
  itemId: string,
  powerUpClass: 'charged' | 'consumable',
): MarkMilestone[] {
  const verbs = VERBS[itemId]
  return verbs === undefined ? [] : milestonesOf(powerUpClass, verbs)
}
