/**
 * The render quality drawn now (ticket 477): the probe's readings, what they chose, and the
 * quality the choice and the ladder leave, flattened so a particle pool reads `particleShare`
 * straight from here (`ParticleShare`). Written only by `RenderPipeline` (`renderAdaptation.ts`),
 * read by the emitters, the sky band and the debug API's render stats. A mutable registry, because
 * the ladder can move it any second and it never goes through React or the store.
 */
import type { GpuCapabilities, SceneTarget, TerrainProgram } from '../systems/render/gpuTier'
import {
  presetQualityOf,
  type RenderQualityChoice,
  type RenderQualityPreset,
} from '../systems/render/renderQuality'

const HIGH = presetQualityOf('high')

/** Until the render pipeline has probed its renderer: the full look, as before the probe. */
export const renderQualityPresence = {
  terrainProgram: 'full' as TerrainProgram,
  sceneTarget: 'half_float' as SceneTarget,
  choice: 'auto' as RenderQualityChoice,
  preset: 'high' as RenderQualityPreset,
  /** The ladder's rung under `auto`; 0 for a named preset, which holds still. */
  rung: 0,
  renderScaleCap: HIGH.renderScaleCap,
  renderFpsCap: HIGH.renderFpsCap,
  particleShare: HIGH.particleShare,
  parallaxLayers: HIGH.parallaxLayers,
  postBloom: HIGH.postBloom,
  /** The preset's bloom on a float scene target. */
  isBloomDrawn: true,
}

/** The probe's readings; null until the render pipeline has probed its renderer. */
export const gpuPresence: { gpu: GpuCapabilities | null } = { gpu: null }

/** Whether the primary pointer is a finger (#173), noted from the shell before the scene mounts. */
export const renderPointerPresence = { isCoarsePointer: false }
