/**
 * What the GPU can draw (TD #470 section 2, ticket 477): the capability probe's readings and the
 * decision table that turns them into the terrain program and the scene target. Graceful fallback,
 * in order: short of the full terrain program's units or a fragment `highp`, the `TERRAIN_LITE`
 * program (flat band colours); no float colour targets, an RGBA8 scene target and no bloom; under
 * the hard minimum, the "this device can't run the game" card. Chosen by capability only, never by
 * the quality knob, and never read by the simulation: a missing capability changes only the look.
 * The per-act hero atlas (ticket 451) takes the 16th unit only on the full program, with 16 units
 * and a KTX2 target with alpha; anywhere else heroes draw the shader look and the unit stays free.
 */
import {
  GPU_MIN_TEXTURE_SIZE,
  GPU_MIN_TEXTURE_UNITS,
  TERRAIN_FULL_SAMPLERS,
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

/**
 * `sampled`: the full program declares `uHeroAtlas` on the 16th unit; `absent`: it does not, so
 * the stage binds 15 and every hero draws the shader look (GD ruling 6226278574 item 2).
 */
export const HERO_ATLAS_UNITS = ['sampled', 'absent'] as const
export type HeroAtlasUnit = (typeof HERO_ATLAS_UNITS)[number]

/**
 * The formats three's `KTX2Loader` transcodes an ETC1S map with alpha to (#52: albedo is ETC1S):
 * BC7, BC3, ETC2 RGBA and PVRTC, at most a byte a texel. `etc1` has no alpha and Basis has no
 * ETC1S path to `astc`; with none of these the loader decodes to RGBA8, which the atlas refuses.
 */
const ALPHA_TRANSCODE_FORMATS: readonly string[] = ['bptc', 's3tc', 'etc2', 'pvrtc']

export const SCENE_TARGETS = ['half_float', 'rgba8'] as const
export type SceneTarget = (typeof SCENE_TARGETS)[number]

export function terrainProgramOf(gpu: GpuCapabilities): TerrainProgram {
  if (isUnderHardMinimum(gpu)) return 'unsupported'
  if (gpu.textureUnits < TERRAIN_FULL_SAMPLERS || !gpu.isFragmentHighp) return 'lite'
  return 'full'
}

export function heroAtlasUnitOf(gpu: GpuCapabilities): HeroAtlasUnit {
  if (terrainProgramOf(gpu) !== 'full' || gpu.textureUnits < TERRAIN_SAMPLER_CEILING) {
    return 'absent'
  }
  return hasAlphaTranscodeTarget(gpu) ? 'sampled' : 'absent'
}

function hasAlphaTranscodeTarget(gpu: GpuCapabilities): boolean {
  return gpu.textureFormats.some((format) => ALPHA_TRANSCODE_FORMATS.includes(format))
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
