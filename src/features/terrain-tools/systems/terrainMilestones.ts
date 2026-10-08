/**
 * The terrain tools' Mark milestones (the GD lock on #256, build 5): the class table's pattern at
 * Marks 3, 6 and 9 of each shipped tool's ladder, with the verb its card line names. Every tool is
 * an income item, so its second tap and hold change only where or how it works, and its
 * sibling-link is its one yield step. A ladder that ends before Mark 9 has no link: the seam
 * splitter's ends at Mark 6 and the lodestone beacon's at Mark 7.
 *
 * The ore-shifter's verbs are the lock's worked example; the others are this ticket's picks, each
 * a where or a how of the same edit, worded and placed by Content's check on #276: "the side you're
 * steering toward" is the kernel's `facedSideOf`, so with the miner facing down a Mark 6 hold
 * lands where its Mark 3 tap does not.
 */
import { milestonesOf, type MarkMilestone, type MilestoneVerbs } from '../../tech-tree'

const ORE_SHIFTER = 'power.ore_shifter'
const SEAM_SPLITTER = 'consumable.seam_splitter'
const PRESSURE_POCKET = 'power.pressure_pocket'
const LODESTONE_BEACON = 'consumable.lodestone_beacon'

const VERBS: Readonly<Record<string, MilestoneVerbs>> = {
  [ORE_SHIFTER]: {
    secondTap: 'pushes the same nodules away from the hull',
    hold: "drags only from the side you're steering toward",
    siblingLink: {
      verb: 'plants a lodestone beacon that draws in half as much ore',
      siblingId: LODESTONE_BEACON,
    },
  },
  [SEAM_SPLITTER]: {
    secondTap: "splits sideways, on the side you're steering toward",
    hold: 'splits straight ahead of the drill, ignoring the grain',
  },
  [PRESSURE_POCKET]: {
    secondTap: 'blows the pocket behind you, away from the drill',
    hold: "blows the pocket on the side you're steering toward",
    siblingLink: {
      verb: 'opens a seam splitter fissure at half length',
      siblingId: SEAM_SPLITTER,
    },
  },
  [LODESTONE_BEACON]: {
    secondTap: 'throws the beacon one gather radius ahead of the drill',
    hold: "sets the beacon one gather radius out on the side you're steering toward",
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
