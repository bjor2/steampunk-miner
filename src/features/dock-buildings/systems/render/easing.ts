/**
 * The eases the dock's staged moves share (#170 auto-roll and showcase camera, the #197 unlock
 * pan): a move's share of its ticks, clamped, and the smoothstep that starts and ends at rest.
 */

export function shareOf(elapsed: number, ticks: number): number {
  return Math.min(Math.max(elapsed / ticks, 0), 1)
}

/** Smoothstep: starts and ends at rest, exactly 0 and 1 at the ends. */
export function easeInOut(share: number): number {
  return share * share * (3 - 2 * share)
}
