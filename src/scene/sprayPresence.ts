/**
 * What the kernel spray layer has done since the page loaded (ticket 348): the pieces asked for,
 * those dropped for want of room, the tracer pieces a blast pushed out, and the most it drew in one
 * frame, read by `steampunkDebug.ui.getSprayStats()`. A mutable record, because it changes every
 * frame and never goes through React or the store.
 */
import type { SceneLayerBudget } from './registries/sceneLayers'
import type { SprayTally } from '../systems/render/sprayPool'

export const sprayPresence = {
  requested: 0,
  dropped: 0,
  evicted: 0,
  peak: { drawCalls: 0, instances: 0 } satisfies SceneLayerBudget,
} satisfies SprayTally & { peak: SceneLayerBudget }
