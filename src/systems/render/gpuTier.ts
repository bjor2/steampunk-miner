/**
 * What the GPU can draw (TD #470 section 2, ticket 477): the capability probe's readings and the
 * decision table that turns them into the terrain program and the scene target. Graceful fallback,
 * in order: short of the full terrain program's units or a fragment `highp`, the `TERRAIN_LITE`
 * program (flat band colours); no float colour targets, an RGBA8 scene target and no bloom; under
 * the hard minimum, the "this device can't run the game" card. Chosen by capability only, never by
 * the quality knob, and never read by the simulation: a missing capability changes only the look.
 */
import {
  GPU_MIN_TEXTURE_SIZE,
  GPU_MIN_TEXTURE_UNITS,
  TERRAIN_SAMPLER_CEILING,
} from '../../constants/scene'

/** The probe's readings, from `gl.getParameter` and the supported extensions, once per renderer. */
export interface GpuCapabilities {
  /** `MAX_TEXTURE_IMAGE_UNITS`: samplers one fragment stage may bind. */
  textureUnits: number
  vertexTextureUnits: number
  combinedTextureUnits: number
  maxTextureSize: number
  fragmentUniformVectors: number
  varyingVectors: number
  /** The fragment stage's `HIGH_FLOAT` has any precision (ticket 339's split positions need it). */
  isFragmentHighp: boolean
  /** `EXT_color_buffer_float`: the half-float scene and bloom targets can be drawn into. */
  hasFloatTargets: boolean
  /** `EXT_color_buffer_half_float`, which some mobile GPUs offer without the full extension. */
  hasHalfFloatTargets: boolean
  /** The compressed formats `KTX2Loader` may transcode to here: astc, bptc, etc2, etc1, s3tc, pvrtc. */
  textureFormats: readonly string[]
}

export const TERRAIN_PROGRAMS = ['full', 'lite', 'unsupported'] as const
/** `unsupported` draws nothing worth seeing: the card covers the stage. */
export type TerrainProgram = (typeof TERRAIN_PROGRAMS)[number]

export const SCENE_TARGETS = ['half_float', 'rgba8'] as const
export type SceneTarget = (typeof SCENE_TARGETS)[number]

export function terrainProgramOf(gpu: GpuCapabilities): TerrainProgram {
  if (isUnderHardMinimum(gpu)) return 'unsupported'
  if (gpu.textureUnits < TERRAIN_SAMPLER_CEILING || !gpu.isFragmentHighp) return 'lite'
  return 'full'
}

/** Half float where the GPU can draw into it; otherwise RGBA8, which also turns bloom off. */
export function sceneTargetOf(gpu: GpuCapabilities): SceneTarget {
  return gpu.hasFloatTargets || gpu.hasHalfFloatTargets ? 'half_float' : 'rgba8'
}

export function isGameDrawable(gpu: GpuCapabilities): boolean {
  return terrainProgramOf(gpu) !== 'unsupported'
}

function isUnderHardMinimum(gpu: GpuCapabilities): boolean {
  return gpu.textureUnits < GPU_MIN_TEXTURE_UNITS || gpu.maxTextureSize < GPU_MIN_TEXTURE_SIZE
}
