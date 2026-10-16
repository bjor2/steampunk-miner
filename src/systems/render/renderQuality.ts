/**
 * The render quality knob (TD #470 section 2.4, ticket 477): a local record like the zoom
 * (`viewZoom.ts`), never in the authority, a command or the digest, and a preference, never save
 * state. Presets low, mid and high; `auto` takes the device's own preset (the capability probe and
 * the pointer) and lets the degradation ladder lower it while frames drop. The ladder's order:
 * the render scale first (`renderScale.ts`), then the rungs here: a 30 fps render cap, then half
 * the particles and the reduced background, then bloom off. Nothing else: a frame that still
 * misses costs in the tick, which is a bug to fix, not a knob.
 */
import {
  FULL_BACKGROUND_LAYERS,
  LOW_RENDER_SCALE_CAP,
  REDUCED_BACKGROUND_LAYERS,
  REDUCED_PARTICLE_SHARE,
  SLOW_RENDER_FPS_CAP,
} from '../../constants/renderQuality'
import type { SceneTarget, TerrainProgram } from './gpuTier'

export interface RenderQuality {
  /** The highest render scale the adaptive rule may reach (never under its floor). */
  renderScaleCap: number
  /** Frames drawn a second; null draws every refresh. The simulation ticks 60 a second anyway. */
  renderFpsCap: number | null
  /** The share of their particles the ambient emitters emit, 0 to 1. */
  particleShare: number
  /** Background layers behind the ground: the sky colour, then the sky band. */
  parallaxLayers: number
  postBloom: boolean
}

export const RENDER_QUALITY_PRESETS = ['low', 'mid', 'high'] as const
export type RenderQualityPreset = (typeof RENDER_QUALITY_PRESETS)[number]

/** `auto` follows the device and the frames; a preset holds still. */
export const RENDER_QUALITY_CHOICES = ['auto', ...RENDER_QUALITY_PRESETS] as const
export type RenderQualityChoice = (typeof RENDER_QUALITY_CHOICES)[number]

const PRESET_QUALITY: Readonly<Record<RenderQualityPreset, RenderQuality>> = {
  high: {
    renderScaleCap: 1,
    renderFpsCap: null,
    particleShare: 1,
    parallaxLayers: FULL_BACKGROUND_LAYERS,
    postBloom: true,
  },
  // #173 section 3: what a phone may lose, and nothing more.
  mid: {
    renderScaleCap: 1,
    renderFpsCap: null,
    particleShare: REDUCED_PARTICLE_SHARE,
    parallaxLayers: REDUCED_BACKGROUND_LAYERS,
    postBloom: true,
  },
  low: {
    renderScaleCap: LOW_RENDER_SCALE_CAP,
    renderFpsCap: SLOW_RENDER_FPS_CAP,
    particleShare: REDUCED_PARTICLE_SHARE,
    parallaxLayers: REDUCED_BACKGROUND_LAYERS,
    postBloom: false,
  },
}

/** Each rung lowers what the one before left; rung 0 is the preset itself. */
const LADDER_RUNGS: readonly ((quality: RenderQuality) => RenderQuality)[] = [
  (quality) => ({ ...quality, renderFpsCap: slowerFpsCap(quality.renderFpsCap) }),
  (quality) => ({
    ...quality,
    particleShare: Math.min(quality.particleShare, REDUCED_PARTICLE_SHARE),
    parallaxLayers: Math.min(quality.parallaxLayers, REDUCED_BACKGROUND_LAYERS),
  }),
  (quality) => ({ ...quality, postBloom: false }),
]

/** The lowest rung: every cut after the render scale applied. */
export const LOWEST_QUALITY_RUNG = LADDER_RUNGS.length

/** What the device is: read once at start, from the probe and the primary pointer. */
export interface RenderDevice {
  terrainProgram: TerrainProgram
  isCoarsePointer: boolean
}

/** A GPU short of the full program starts low; a phone or tablet mid (#173); the rest high. */
export function devicePresetOf(device: RenderDevice): RenderQualityPreset {
  if (device.terrainProgram !== 'full') return 'low'
  return device.isCoarsePointer ? 'mid' : 'high'
}

export function presetQualityOf(preset: RenderQualityPreset): RenderQuality {
  return PRESET_QUALITY[preset]
}

/** The preset `choice` draws on `device`: its own, or the device's for `auto`. */
export function chosenPresetOf(
  choice: RenderQualityChoice,
  device: RenderDevice,
): RenderQualityPreset {
  return choice === 'auto' ? devicePresetOf(device) : choice
}

/** `preset` lowered through the ladder down to `rung` (0 leaves it as it is). */
export function degradedQualityOf(preset: RenderQualityPreset, rung: number): RenderQuality {
  return LADDER_RUNGS.slice(0, rung).reduce(
    (quality, lower) => lower(quality),
    presetQualityOf(preset),
  )
}

/** Bloom needs a float scene target: an RGBA8 one (no float targets) draws without it. */
export function isBloomDrawn(quality: RenderQuality, sceneTarget: SceneTarget): boolean {
  return quality.postBloom && sceneTarget === 'half_float'
}

/** Why `value` cannot be the render quality choice; empty when it can. */
export function renderQualityChoiceProblems(value: unknown): string[] {
  if (RENDER_QUALITY_CHOICES.includes(value as RenderQualityChoice)) return []
  return [
    `render quality must be one of ${RENDER_QUALITY_CHOICES.join(', ')}, got ${JSON.stringify(value)}`,
  ]
}

function slowerFpsCap(fpsCap: number | null): number {
  return fpsCap === null ? SLOW_RENDER_FPS_CAP : Math.min(fpsCap, SLOW_RENDER_FPS_CAP)
}
