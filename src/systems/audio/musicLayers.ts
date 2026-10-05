/**
 * The layered music (#13, #49): four layers of authored loops, crossfaded by where the vehicle is.
 * Each layer's target is a pure function of a moment read from the authority replica (#49 picks
 * authority state only, so a replay or a scenario gives the same music):
 *
 *   platform  docked, or within 10 m of the hub, on the surface
 *   ambience  underground; louder the deeper the band
 *   tension   underground in band 4 or deeper, or energy below the low-energy line
 *   combat    an enemy within 8 m, louder the closer
 *
 * The two planets share the layers with different tuning; `easeLayers` crossfades toward the
 * targets on the render delta, the same at any frame rate. While the artefact choice is open the
 * layers are ducked 6 dB; music volume and mute are local settings, never in the digest.
 */
import {
  AMBIENCE_BAND_1_SHARE,
  COMBAT_RANGE_METRES,
  LAYER_FADE_SECONDS,
  MUSIC_DUCK_DB,
  PLANET_TUNING_SEMITONES,
  PLATFORM_RANGE_METRES,
  TENSION_FROM_BAND,
} from '../../constants/audio'
import { MM_PER_METRE } from '../../constants/physics'
import type { Enemy } from '../authority/combat/combatState'
import { BAND_COUNT } from '../world/planetGeometry'

export interface MusicLayers {
  platform: number
  ambience: number
  tension: number
  combat: number
}

export interface MusicMoment {
  isDocked: boolean
  /** Whole metres to the hub's dock point, or null with no planet or pose. */
  dockDistanceMetres: number | null
  depthTiles: number
  /** The depth band 1 to 5 under the vehicle, or null with no planet. */
  band: number | null
  /** At or below the HUD's low-energy line (#33 section 5). */
  isEnergyLow: boolean
  /** Metres to the nearest active enemy, or null with none. */
  nearestEnemyMetres: number | null
  /** The artefact choice is on screen (S10, #64): the layers duck while it is. */
  isArtefactChoiceOpen: boolean
}

/** The local music settings (#49): never authority state, never in the digest. */
export interface MusicSettings {
  musicVolume: number
  musicMuted: boolean
}

export const SILENT_LAYERS: MusicLayers = { platform: 0, ambience: 0, tension: 0, combat: 0 }

const LAYER_NAMES = ['platform', 'ambience', 'tension', 'combat'] as const
const DECIBELS_PER_AMPLITUDE_DECADE = 20

/** The share of its level a ducked layer keeps: -6 dB is about half. */
export const DUCKED_SHARE = 10 ** (-MUSIC_DUCK_DB / DECIBELS_PER_AMPLITUDE_DECADE)

/** The layers' targets for this moment, written in place (the stage refreshes them often). */
export function writeMusicTargets(moment: MusicMoment, targets: MusicLayers): void {
  const atPlatform = isAtPlatform(moment)
  const underground = !atPlatform && moment.depthTiles > 0
  targets.platform = atPlatform ? 1 : 0
  targets.ambience = underground ? ambienceShareOfBand(moment.band) : 0
  targets.tension = !atPlatform && isTense(moment, underground) ? 1 : 0
  targets.combat = combatShareOf(moment.nearestEnemyMetres)
}

export function musicTargetsOf(moment: MusicMoment): MusicLayers {
  const targets = { ...SILENT_LAYERS }
  writeMusicTargets(moment, targets)
  return targets
}

/** The whole music bus's level: the volume setting, silent when muted, ducked during the choice. */
export function musicBusGainOf(settings: MusicSettings, isArtefactChoiceOpen: boolean): number {
  if (settings.musicMuted) return 0
  return settings.musicVolume * (isArtefactChoiceOpen ? DUCKED_SHARE : 1)
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

/** Metres from a point (mm) to the nearest enemy, or null with none. */
export function nearestEnemyMetresOf(
  enemies: readonly Enemy[],
  from: { x: number; y: number },
): number | null {
  let nearestSq: number | null = null
  for (const enemy of enemies) {
    const dx = enemy.x - from.x
    const dy = enemy.y - from.y
    const distanceSq = dx * dx + dy * dy
    if (nearestSq === null || distanceSq < nearestSq) nearestSq = distanceSq
  }
  return nearestSq === null ? null : Math.sqrt(nearestSq) / MM_PER_METRE
}

function isAtPlatform(moment: MusicMoment): boolean {
  if (moment.depthTiles > 0) return false
  return moment.isDocked || isNearHub(moment.dockDistanceMetres)
}

function isNearHub(dockDistanceMetres: number | null): boolean {
  return dockDistanceMetres !== null && dockDistanceMetres < PLATFORM_RANGE_METRES
}

function isTense(moment: MusicMoment, underground: boolean): boolean {
  return moment.isEnergyLow || (underground && (moment.band ?? 1) >= TENSION_FROM_BAND)
}

/** Band 1 plays at `AMBIENCE_BAND_1_SHARE`, rising evenly to full in the last band. */
function ambienceShareOfBand(band: number | null): number {
  const deeperBands = Math.min(Math.max((band ?? 1) - 1, 0), BAND_COUNT - 1)
  return AMBIENCE_BAND_1_SHARE + ((1 - AMBIENCE_BAND_1_SHARE) * deeperBands) / (BAND_COUNT - 1)
}

function combatShareOf(nearestEnemyMetres: number | null): number {
  if (nearestEnemyMetres === null) return 0
  return Math.max(0, 1 - nearestEnemyMetres / COMBAT_RANGE_METRES)
}
