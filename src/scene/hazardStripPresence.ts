/**
 * The hazard strip this frame (ticket 341): written by `HazardStripSampler` each frame, read by the
 * HUD's strip on its own animation frame. A mutable registry, because the pips change every frame
 * and must never go through React or the store (CLAUDE.md, frame loop rules).
 */
import { STRIP_WINDOW_SECONDS } from '../constants/hazardStrip'
import { createStripPips, type StripPip } from '../systems/render/hazardStrip/stripPips'
import { STRIP_TIER, type StripTier } from '../systems/render/hazardStrip/stripTiers'

export const hazardStripPresence: {
  pips: StripPip[]
  pipCount: number
  tier: StripTier
  windowSeconds: number
  /** Whether a planet is under the rig, so the strip has a path to show. */
  isSampling: boolean
} = {
  pips: createStripPips(),
  pipCount: 0,
  tier: STRIP_TIER.exact,
  windowSeconds: STRIP_WINDOW_SECONDS,
  isSampling: false,
}
