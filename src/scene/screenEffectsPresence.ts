/**
 * This frame's screen shake and flash: kicked by feedback cues and stepped by `ScreenFeedback`,
 * read by the camera (its offset) and the flash overlay. A mutable registry like
 * `vehiclePresence`, because it changes every frame and never goes through React or the store.
 */
import { createScreenEffects } from '../systems/feedback/screenEffects'

export const screenEffects = createScreenEffects()
