/**
 * Each mobility item's Mark ladder (spec #162 section 4.6, as `tech-tree`'s `MarkLadder` reads it):
 * Mark 1 is the item as bought, and every Mark steps cooldown, then magnitude, then charges, until
 * all are capped and the item is Mastered; Marks 3, 6 and 9 also bring a milestone verb (#256).
 * Charged items step all three; consumables step their magnitude and stack; the toggles step their
 * energy draw (#162 4.6: "energy draw ×0.92, floor 0.5×", carried in bp in the ladder's cooldown)
 * and have no magnitude. None moves ore, so none takes the income limits.
 *
 * Each magnitude is the stat #162 4.2 and 4.3 name: the grapple's range in tiles, the rivet
 * patch's share of `hullMax` in basis points, and the rest's windows in ticks.
 */
import type { MarkLadder } from '../../tech-tree'
import { MOBILITY_ITEM, type MobilityItemId } from './itemIds'
import { MOBILITY_ECONOMY } from './mobilityEconomy'
import { MOBILITY_MILESTONES } from './mobilityMilestones'

const N = MOBILITY_ECONOMY

const STEPS: Readonly<Record<MobilityItemId, MarkLadder>> = {
  [MOBILITY_ITEM.grappleWinch]: charged(N.grapple, N.grapple.rangeTiles),
  [MOBILITY_ITEM.emergencyBallast]: consumable(N.ballast.stack, N.ballast.windowTicks),
  [MOBILITY_ITEM.heatSinkFlask]: consumable(N.heatSink.stack, N.heatSink.pauseTicks),
  [MOBILITY_ITEM.steamBoost]: charged(N.steamBoost, N.steamBoost.burstTicks),
  [MOBILITY_ITEM.rivetPatch]: consumable(N.rivetPatch.stack, N.rivetPatch.hullShareBp),
  [MOBILITY_ITEM.steamShield]: charged(N.steamShield, N.steamShield.windowTicks),
  [MOBILITY_ITEM.smokeCanister]: consumable(N.smoke.stack, N.smoke.windowTicks),
  [MOBILITY_ITEM.gravAnchor]: toggle(N.gravAnchor.drawBpPerSecond),
  [MOBILITY_ITEM.buoyancyTanks]: toggle(N.buoyancy.drawBpPerSecond),
  [MOBILITY_ITEM.escapeThruster]: consumable(N.escapeThruster.stack, N.escapeThruster.burstTicks),
}

/** Each ladder with its Mark 3, 6 and 9 milestones (ticket 275, `mobilityMilestones.ts`). */
export const MARK_LADDERS: Readonly<Record<MobilityItemId, MarkLadder>> = Object.fromEntries(
  Object.entries(STEPS).map(([itemId, ladder]) => [
    itemId,
    { ...ladder, milestones: MOBILITY_MILESTONES[itemId as MobilityItemId] },
  ]),
) as Record<MobilityItemId, MarkLadder>

export function markLadderOf(itemId: string): MarkLadder | null {
  return MARK_LADDERS[itemId as MobilityItemId] ?? null
}

function charged(
  numbers: { charges: number; cooldownTicks: number },
  magnitude: number,
): MarkLadder {
  return {
    isIncomeItem: false,
    cooldown: numbers.cooldownTicks,
    magnitude: { base: magnitude },
    charges: numbers.charges,
  }
}

function consumable(stack: number, magnitude: number): MarkLadder {
  return { isIncomeItem: false, magnitude: { base: magnitude }, charges: stack }
}

function toggle(drawBpPerSecond: number): MarkLadder {
  return { isIncomeItem: false, cooldown: drawBpPerSecond }
}
