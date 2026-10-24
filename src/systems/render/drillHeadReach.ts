/**
 * How far ahead of the body's centre the drill head is drawn (ticket 789): its tip, the frontmost
 * edge of the head's parts, sits on the cut's front (`ridingCutFrontAheadMmOf`), so the bit is
 * drawn where the ground opens at every tier, facing and bore width. The reach reads the cut's own
 * numbers, never the plate's width alone: drawn outside the collider, the tier-3 tip sat a quarter
 * metre into uncut rock and the face opened behind it ("drills behind the casing", #789). Looks a
 * slice stands in a head slot ride the head and never move it: the shipped parts set the tip.
 */
import { MM_PER_METRE } from '../../constants/physics'
import type { ArtCatalogue } from '../art/artCatalogue'
import type { AssetQuad } from '../art/assetLook'
import { NO_SWAPS } from '../art/placeholderLook'
import { ridingCutFrontAheadMmOf } from '../vehicle/drillStamp'
import { drillHeadQuadsOf } from './vehicleLook'

/** Metres from the body's centre to the head plate's centre, as `drillHeadPose` places it. */
export function drillHeadReachOf(
  art: ArtCatalogue,
  visualTier: number,
  swappedPartIds: readonly string[] = NO_SWAPS,
): number {
  return ridingCutFrontAheadMmOf() / MM_PER_METRE - drillTipAheadOf(art, visualTier, swappedPartIds)
}

/** How far the head's frontmost part reaches past the plate's centre, facing right, in metres. */
export function drillTipAheadOf(
  art: ArtCatalogue,
  visualTier: number,
  swappedPartIds: readonly string[] = NO_SWAPS,
): number {
  return Math.max(0, ...drillHeadQuadsOf(art, visualTier, swappedPartIds).map(frontEdgeOf))
}

function frontEdgeOf(quad: AssetQuad): number {
  return quad.centre[0] + quad.size[0] / 2
}
