/**
 * How bright a magnet field is and how far it has opened at a tick (GD ruling on #286 Q2): a
 * waiting beacon at its faint light, a gather ramping from faint to bright over the look's
 * `rampTicks`, a wave opening from the coil over its `growTicks`, each fading out over the last
 * `fadeTicks` before its end. The layer's vertex shader is this, ported literally
 * (`MagnetFieldLayer.tsx`); it runs on authority ticks, so it reads the same at any frame rate.
 */
import { MAGNET_FIELD_LOOK, type MagnetFieldLook } from './magnetFieldLook'
import type { MagnetFieldKind, MagnetFieldTiming } from './magnetFields'

/** A field's light before and after it brightens: one level for the coil and the clamp. */
export interface FieldLevels {
  faint: number
  bright: number
}

export function levelsOfField(
  kind: MagnetFieldKind,
  look: MagnetFieldLook = MAGNET_FIELD_LOOK,
): FieldLevels {
  const faint = kind === 'attract' ? look.faintOpacity : look.brightOpacity
  return { faint, bright: look.brightOpacity }
}

/** The field's opacity at `tick`: 0 before it starts and once it has faded out. */
export function fieldLightAt(
  timing: MagnetFieldTiming,
  levels: FieldLevels,
  tick: number,
  look: MagnetFieldLook = MAGNET_FIELD_LOOK,
): number {
  if (tick < timing.startTick) return 0
  const bright = shareBetween(tick, timing.brightFromTick, look.rampTicks)
  const fade = 1 - shareBetween(tick, timing.endTick - look.fadeTicks, look.fadeTicks)
  return (levels.faint + (levels.bright - levels.faint) * bright) * fade
}

/** How far the field has opened from its centre, 0 to 1; a field with no growth is whole. */
export function fieldGrowthAt(timing: MagnetFieldTiming, tick: number): number {
  if (timing.growTicks === 0) return 1
  return shareBetween(tick, timing.startTick, timing.growTicks)
}

/** How far `tick` is through the `ticks` from `fromTick`, held to 0..1. */
function shareBetween(tick: number, fromTick: number, ticks: number): number {
  return Math.min(Math.max((tick - fromTick) / ticks, 0), 1)
}
