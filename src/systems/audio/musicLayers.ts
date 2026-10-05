/**
 * The layered music (#13): a warm clockwork-and-brass loop at the platform; underground a low
 * drone of three layers (ambience, tension, combat) crossfaded by depth and enemy proximity. The
 * two planets share the layers with different tuning. Targets are a pure function of where the
 * vehicle is; `easeLayers` crossfades toward them on the render delta, the same at any frame rate.
 */
import {
  COMBAT_RANGE_METRES,
  LAYER_FADE_SECONDS,
  PLANET_TUNING_SEMITONES,
  TENSION_FULL_DEPTH_TILES,
} from '../../constants/audio'

export interface MusicLayers {
  platform: number
  ambience: number
  tension: number
  combat: number
}

export interface MusicMoment {
  isDocked: boolean
  depthTiles: number
  /** Metres to the nearest active enemy, or null with none. */
  nearestEnemyMetres: number | null
}

export const SILENT_LAYERS: MusicLayers = { platform: 0, ambience: 0, tension: 0, combat: 0 }

const LAYER_NAMES = ['platform', 'ambience', 'tension', 'combat'] as const

export function musicTargetsOf(moment: MusicMoment): MusicLayers {
  if (moment.isDocked) return { ...SILENT_LAYERS, platform: 1 }
  const underground = moment.depthTiles > 0 ? 1 : 0
  return {
    platform: 1 - underground,
    ambience: underground,
    tension: underground * Math.min(moment.depthTiles / TENSION_FULL_DEPTH_TILES, 1),
    combat: combatShareOf(moment.nearestEnemyMetres),
  }
}

/** Semitones every layer is shifted on this planet: planet 1 as written, each next one lower. */
export function planetTuningOf(planetIndex: number): number {
  return planetIndex <= 1 ? 0 : (planetIndex - 1) * PLANET_TUNING_SEMITONES
}

/** One frame of the crossfade, in place: each layer closes the same share of its gap per second. */
export function easeLayers(layers: MusicLayers, targets: MusicLayers, dt: number): void {
  const share = 1 - Math.exp(-dt / LAYER_FADE_SECONDS)
  for (const name of LAYER_NAMES) layers[name] += (targets[name] - layers[name]) * share
}

function combatShareOf(nearestEnemyMetres: number | null): number {
  if (nearestEnemyMetres === null) return 0
  return Math.max(0, 1 - nearestEnemyMetres / COMBAT_RANGE_METRES)
}
