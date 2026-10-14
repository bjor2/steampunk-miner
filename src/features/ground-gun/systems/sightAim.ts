/**
 * The gimbal sight on the fire input (ticket 318; Content's table on #310 with the GD's value
 * rule): with no manual aim (a tap, a stick at rest, no cursor over the canvas) the gun fires on
 * the sight's pick instead of along the facing. The pick is the kernel's own (`bestBoreBearingOf`,
 * #317: the reachable ore of highest sale value, holds ignored), so the sight and auto mode never
 * disagree. Any manual aim overrides it. The sight looks again at most every `retargetTicks` (its
 * Mark stat), which keeps its cost at the TD's one pick per 15 ticks or slower.
 */

/** The sight's last look: the tick it looked and the bearing it found, null for no ore in reach. */
export interface SightPick {
  pickedTick: number
  bearing: number | null
}

/** Whether the sight looks again now: never looked, its hold ran out, or the clock went back. */
export function isSightPickDue(
  pick: SightPick | null,
  tick: number,
  retargetTicks: number,
): boolean {
  if (pick === null || tick < pick.pickedTick) return true
  return tick - pick.pickedTick >= retargetTicks
}

/** The bearing a shot with no manual aim takes: the sight's pick, else the facing. */
export function restingBearingOf(pick: SightPick | null, facingBearing: number): number {
  return pick?.bearing ?? facingBearing
}
