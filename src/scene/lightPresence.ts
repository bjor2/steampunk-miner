/**
 * The lights shining this frame (#38: the headlamp plus at most 4 point lights): written by
 * `LightRig` each frame, read by the terrain shader's uniforms and the debug API's render stats.
 * A mutable registry, because it changes every frame and never goes through React or the store.
 */
import type { PointLightSource } from '../systems/render/sceneLights'

export const lightPresence: { headlamps: number; pointLights: PointLightSource[] } = {
  headlamps: 1,
  pointLights: [],
}
