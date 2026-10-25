/**
 * What the blast front layer has drawn since the page loaded (#215, the "within its declared
 * budget at R24" check; D8 ticket 868 adds the blasts, showcases and falls played): the slices it
 * threw and the most it drew in one frame, read by
 * `steampunkDebug.features['dynamite-visuals'].getFront()`. A mutable record, because it changes
 * every frame and never goes through React or the store.
 */
import type { LayerDraw } from '../systems/render/blastFrontLook'

export const blastFrontPresence = {
  frontsThrown: 0,
  flashesLit: 0,
  blastsPlayed: 0,
  showcasesPlayed: 0,
  fallsPlayed: 0,
  peak: { drawCalls: 0, instances: 0 } satisfies LayerDraw,
}
