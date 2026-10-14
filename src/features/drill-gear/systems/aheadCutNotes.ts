/**
 * Content's "doesn't stack" lines (Content on #392, after the GD ruling there): the plunge crown
 * (Deep) and the reach boom ask for the same cut ahead of the bit, and the kernel takes the larger
 * ask, never the sum (`foldDrillGear`). Deep is forked against Wide, not the boom, so a player may
 * own both; each card says so. A line shows only while the other item is in the lane's catalogue,
 * whoever owns it. No numbers.
 */
import type { ForkPair } from '../../tech-tree'
import { REACH_BOOM_ID } from './cuttersAndBoom'
import { SHIPPED_DRILL_GEAR } from './drillGearItems'

export const PLUNGE_CROWN_NOTE = "doesn't stack with the reach boom; the longer cut ahead wins"
export const REACH_BOOM_NOTE = "doesn't stack with the plunge crown; the longer cut ahead wins"

/** The plunge crown's note while the lane ships the reach boom. */
export function plungeCrownNotes(): string[] {
  const isBoomShipped = SHIPPED_DRILL_GEAR.some((item) => item.itemId === REACH_BOOM_ID)
  return isBoomShipped ? [PLUNGE_CROWN_NOTE] : []
}

/** The reach boom's note while the lane's fork offers the plunge crown, `crownId`. */
export function reachBoomNotesOf(fork: ForkPair, crownId: string): string[] {
  const isCrownOffered = fork.branches.some((branch) => branch.unlocks === crownId)
  return isCrownOffered ? [REACH_BOOM_NOTE] : []
}
