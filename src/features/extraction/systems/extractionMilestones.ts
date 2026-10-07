/**
 * The mineral drain's Mark milestones (the GD lock on #256, build 5): a channel carries a Mark 3
 * second tap and a Mark 6 sibling-link, and Mark 9 stays a number step. The drain is an income
 * item, so its second tap changes only where it drains: the same cells per use, cap and cooldown.
 *
 * Its Mark 6 link waits: the lane's only other item, the slurry siphon, is held unregistered and
 * no tree node may name it (GD ruling on #201 Q1, `laneRows.test.ts`), so until it ships Mark 6
 * stays a number step and the drain has no yield milestone.
 */
import { milestonesOf, type MarkMilestone } from '../../tech-tree'

const MINERAL_DRAIN = 'power.mineral_drain'

/** The item's milestones; none for the held siphon. */
export function extractionMilestonesOf(itemId: string): MarkMilestone[] {
  if (itemId !== MINERAL_DRAIN) return []
  return milestonesOf('channel', { secondTap: 'drains from the rim of its reach inward' })
}
