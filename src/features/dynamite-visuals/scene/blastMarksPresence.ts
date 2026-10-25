/**
 * What the blast marks layer has drawn since the page loaded (D7, ticket 866; the "within its
 * declared budget" check of #215): the craters it holds, the rings and sparks it drew last frame
 * and the most it drew in one, read by `steampunkDebug.features['dynamite-visuals'].getMarks()`.
 * A mutable record, because it changes every frame and never goes through React or the store.
 */
import type { LayerDraw } from '../systems/render/blastFrontLook'

export const blastMarksPresence = {
  craters: 0,
  decals: 0,
  rings: 0,
  sparks: 0,
  peak: { drawCalls: 0, instances: 0 } satisfies LayerDraw,
}
