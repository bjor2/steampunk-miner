/**
 * The pickup sound's rate cap (ticket 615, the G&V bar on #442 for option A): at most
 * `PICKUP_CHIMES_PER_SECOND_MAX` chimes a second. A pickup inside the gap after a chime is held,
 * and every pickup held there merges into one chime when the gap ends, at the pitch of the highest
 * tier merged: a rarer find inside a band is a higher tier, so the merged tick rises with rarity.
 * Counted down on the render delta like `delayedThumps.ts`, so it caps the same at any frame rate;
 * kept in place, so a frame allocates nothing.
 */
import { PICKUP_CHIMES_PER_SECOND_MAX } from '../../constants/audio'

const CHIME_GAP_SECONDS = 1 / PICKUP_CHIMES_PER_SECOND_MAX

/** Frame deltas summed in floats land a hair short of a whole gap; that hair is open already. */
const OPEN_SLACK_SECONDS = 1e-9

export interface PickupChimeCap {
  secondsUntilOpen: number
  /** The highest tier held for the next chime; null when none waits. */
  heldTier: number | null
}

export function createPickupChimeCap(): PickupChimeCap {
  return { secondsUntilOpen: 0, heldTier: null }
}

/** The tier to chime now, or null when the pickup waits to merge into the next chime. */
export function offerPickupChime(cap: PickupChimeCap, tier: number): number | null {
  if (isChimeOpen(cap)) return chimeNow(cap, tier)
  cap.heldTier = Math.max(cap.heldTier ?? tier, tier)
  return null
}

/** Counts the gap down by `dt`; the merged tier to chime once it ends with pickups held, or null. */
export function takeDueChime(cap: PickupChimeCap, dt: number): number | null {
  cap.secondsUntilOpen = Math.max(0, cap.secondsUntilOpen - dt)
  if (cap.heldTier === null || !isChimeOpen(cap)) return null
  return chimeNow(cap, cap.heldTier)
}

function isChimeOpen(cap: PickupChimeCap): boolean {
  return cap.secondsUntilOpen <= OPEN_SLACK_SECONDS
}

function chimeNow(cap: PickupChimeCap, tier: number): number {
  cap.secondsUntilOpen = CHIME_GAP_SECONDS
  cap.heldTier = null
  return tier
}
