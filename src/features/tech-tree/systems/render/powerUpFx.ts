/**
 * The look of the power-up effects (spec #162 section 5 "VFX", #166) at a tick since activation:
 * drain brine lines crawling to the hull, the siphon's stream, the shifter's nodules tumbling,
 * the lodestone's gather, the Induction Coil freeing one cell, the sounder rings and the Seismic
 * Ping's cone, the flare's flight and burn, the foam cone, the steam shield's curtain, the boost
 * plume, and the twists' standing grapple line and salvage plate. Each is shaped from the #162
 * section 4 magnitudes in `techGear.json` and drawn by the kernel's procedural particles (#51):
 * nothing here is a Blender asset. The three magnet verbs stay distinct kinds, so the Induction
 * Coil (frees), the ore-shifter (drags) and the lodestone (gathers) never read alike.
 */
import { SPARK_CAPACITY } from '../../../../constants/scene'
import { powerUpFxOf, type FxKind, type PowerUpFx } from './techGear'

/** What the effect draws at one tick; `reachM` is its extent from the hull or the hit cell. */
export interface FxFrame {
  reachM: number
  /** 0 to 1, the strength the particles and lines draw at. */
  alpha: number
  strands: number
  isOver: boolean
}

/** A tile is one metre (#52 "scene conventions"). */
const METRES_PER_TILE = 1

/** Fades over its last sweep, so a curtain drops rather than vanishes. */
const FADING_KINDS: readonly FxKind[] = ['curtain']

/** Stays until replaced: a planted anchor, a plate left on the wall. */
const STANDING_KINDS: readonly FxKind[] = ['line', 'plate']

/** Lingers as a reveal after its sweep, fading over the whole duration. */
const LINGERING_KINDS: readonly FxKind[] = ['ring', 'cone', 'burn', 'plume']

/** The flare climbs this many tiles over its flight (G&V: visible above the hull 10+ ticks). */
const FLARE_APEX_TILES = 6

export function fxFrameOf(fx: PowerUpFx, tick: number): FxFrame {
  const sweep = smoothstep(clampUnit(tick / fx.sweepTicks))
  const alpha = isStanding(fx) ? 1 : alphaOf(fx, tick)
  return {
    reachM: fx.reachTiles * METRES_PER_TILE * sweep,
    alpha,
    strands: Math.min(fx.strands, SPARK_CAPACITY),
    isOver: !isStanding(fx) && tick >= fx.ticks,
  }
}

/** The frame of the effect named `fxId`; null for an unknown id. */
export function fxFrameOfId(fxId: string, tick: number): FxFrame | null {
  const fx = powerUpFxOf(fxId)
  return fx === null ? null : fxFrameOf(fx, tick)
}

/**
 * The flare shell's place in tiles from the mortar, up and back first, then arcing to the aim
 * side (+X) over the sweep, so the player sees where it came from (G&V mortar pick).
 */
export function flareShellPointOf(fx: PowerUpFx, tick: number): readonly [number, number] {
  const p = clampUnit(tick / fx.sweepTicks)
  const across = fx.reachTiles * (p * p * (1 + 1 / 2) - p / 2)
  const up = 4 * FLARE_APEX_TILES * p * (1 - p)
  return [across, up]
}

export function isStanding(fx: PowerUpFx): boolean {
  return STANDING_KINDS.includes(fx.kind)
}

/** `free`, `drag` or `gather` for the three magnet verbs (#162 "read differently"); else null. */
export function magnetVerbOf(fx: PowerUpFx): 'free' | 'drag' | 'gather' | null {
  return fx.kind === 'free' || fx.kind === 'drag' || fx.kind === 'gather' ? fx.kind : null
}

function alphaOf(fx: PowerUpFx, tick: number): number {
  if (tick >= fx.ticks) return 0
  if (LINGERING_KINDS.includes(fx.kind)) return 1 - tick / fx.ticks
  if (FADING_KINDS.includes(fx.kind)) return clampUnit((fx.ticks - tick) / fx.sweepTicks)
  return 1
}

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value)
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value))
}
