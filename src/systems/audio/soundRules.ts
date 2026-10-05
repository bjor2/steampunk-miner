/**
 * The parametric sound effects (#13 "Audio direction"): pure functions from what the game is doing
 * to what each voice plays, so the sound stage only plays them. Plain numbers out, because the
 * stage asks every frame. The pickup chime climbs a musical
 * scale with the resource tier, so rising value is audible; the drill strains lower and louder as
 * the tile takes longer; the engine chugs faster with speed; the lift hisses.
 */
import {
  CHIME_BASE_HZ,
  CHIME_MAX_OCTAVES,
  DRILL_FREE_HZ,
  DRILL_GAIN_MAX,
  DRILL_GAIN_MIN,
  DRILL_HALF_LOAD_SECONDS,
  DRILL_LOADED_HZ,
  ENGINE_GAIN_IDLE,
  ENGINE_GAIN_TOP,
  ENGINE_IDLE_PUFFS,
  ENGINE_TOP_PUFFS,
  ENGINE_TOP_SPEED,
  STEAM_GAIN,
} from '../../constants/audio'
import { TICKS_PER_SECOND } from '../../constants/physics'
import type { TileTime } from '../views/tileTime'

/** Semitones of the major scale's seven degrees above the tonic. */
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11]
const SEMITONES_PER_OCTAVE = 12

/** Semitones above tier 1's note: one scale degree per tier, capped `CHIME_MAX_OCTAVES` up. */
export function chimeSemitonesOf(tier: number): number {
  const degree = Math.min(Math.max(0, tier - 1), CHIME_MAX_OCTAVES * MAJOR_SCALE.length)
  const octave = Math.floor(degree / MAJOR_SCALE.length)
  return octave * SEMITONES_PER_OCTAVE + MAJOR_SCALE[degree % MAJOR_SCALE.length]
}

export function chimeFrequencyOf(tier: number): number {
  return CHIME_BASE_HZ * 2 ** (chimeSemitonesOf(tier) / SEMITONES_PER_OCTAVE)
}

/** A tile the tip cannot scratch strains the drill as hard as it goes. */
const BLOCKED_SECONDS = Number.POSITIVE_INFINITY

/** The tile ahead's drill time (#7, the HUD's "time per tile here"), or null with no tile. */
export function secondsPerTileOf(tileTime: TileTime): number | null {
  if (tileTime.state === 'none') return null
  return tileTime.state === 'blocked' ? BLOCKED_SECONDS : tileTime.ticks / TICKS_PER_SECOND
}

/** 0 for an instant tile, rising toward 1 as the tile takes longer; null (no tile) is 0. */
export function drillLoadOf(secondsPerTile: number | null): number {
  if (secondsPerTile === null || secondsPerTile <= 0) return 0
  if (secondsPerTile === BLOCKED_SECONDS) return 1
  return secondsPerTile / (secondsPerTile + DRILL_HALF_LOAD_SECONDS)
}

/** The motor sings high on soft rock and strains lower as the load rises. */
export function drillFrequencyOf(load: number): number {
  return DRILL_FREE_HZ + (DRILL_LOADED_HZ - DRILL_FREE_HZ) * load
}

/** Silent unless the drill bites; louder under load. */
export function drillGainOf(isDrilling: boolean, load: number): number {
  return isDrilling ? DRILL_GAIN_MIN + (DRILL_GAIN_MAX - DRILL_GAIN_MIN) * load : 0
}

/** The engine's chug, puffs per second, faster with speed up to its top speed. */
export function enginePuffsOf(speedMetresPerSecond: number): number {
  return (
    ENGINE_IDLE_PUFFS + (ENGINE_TOP_PUFFS - ENGINE_IDLE_PUFFS) * speedShareOf(speedMetresPerSecond)
  )
}

export function engineGainOf(speedMetresPerSecond: number): number {
  return (
    ENGINE_GAIN_IDLE + (ENGINE_GAIN_TOP - ENGINE_GAIN_IDLE) * speedShareOf(speedMetresPerSecond)
  )
}

export function steamGainOf(isLifting: boolean): number {
  return isLifting ? STEAM_GAIN : 0
}

function speedShareOf(speedMetresPerSecond: number): number {
  return Math.min(Math.abs(speedMetresPerSecond) / ENGINE_TOP_SPEED, 1)
}
