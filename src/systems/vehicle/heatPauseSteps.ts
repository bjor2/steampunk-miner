/**
 * A heat sink's windows laid over a span of the heat gauge (ticket 233, the GD lock on #204 Q2):
 * at a window's first tick the gauge vents a share of its level, and until the window ends only a
 * share of the heat gain lands; cooling is never touched. Several windows multiply, and the
 * kernel never lets a vent keep, or a paused gain land, less than `floorBp` (the heat-sink floor
 * in `itemEffectCaps`). The gauge settles lazily, so a span's segments (drilling first, then the
 * rest) are cut at every window edge inside it; a vent lands in the span that holds its tick, so
 * it lands exactly once. No windows leaves the segments as they were.
 */
import { BASIS_POINTS } from '../../constants/balance'
import { flooredScaleBp } from '../economy/itemEffectCaps'
import type { HeatSegment, HeatStep } from './vehicleHeat'

export interface HeatPauseWindow {
  /** The tick the gauge vents and the pause begins. */
  fromTick: number
  /** The first tick heat gain lands in full again. */
  untilTick: number
  /** The share of the gauge vented at `fromTick`, in basis points. */
  ventBp: number
  /** The share of heat gain that still lands during the window, in basis points: 0 pauses it. */
  gainBp: number
}

interface TimedSegment {
  from: number
  to: number
  unitsPerTick: number
}

/** The span's segments from `startTick`, with the windows' vents and paused gains laid in. */
export function pausedHeatSteps(
  segments: readonly HeatSegment[],
  startTick: number,
  windows: readonly HeatPauseWindow[],
  floorBp: number,
): readonly HeatStep[] {
  if (windows.length === 0) return segments
  return timedSegmentsOf(segments, startTick)
    .flatMap((segment) => piecesOf(segment, windows))
    .flatMap((piece) => stepsOfPiece(piece, windows, floorBp))
}

function timedSegmentsOf(segments: readonly HeatSegment[], startTick: number): TimedSegment[] {
  return segments.map(({ ticks, unitsPerTick }, index) => {
    const from = startTick + ticksOf(segments.slice(0, index))
    return { from, to: from + ticks, unitsPerTick }
  })
}

function ticksOf(segments: readonly HeatSegment[]): number {
  return segments.reduce((sum, segment) => sum + segment.ticks, 0)
}

/** The segment cut at every window edge strictly inside it; none for an empty segment. */
function piecesOf(segment: TimedSegment, windows: readonly HeatPauseWindow[]): TimedSegment[] {
  const edges = windows
    .flatMap((window) => [window.fromTick, window.untilTick])
    .filter((tick) => tick > segment.from && tick < segment.to)
  const cuts = [...new Set([segment.from, ...edges, segment.to])].sort((a, b) => a - b)
  return cuts.slice(1).map((to, index) => ({ ...segment, from: cuts[index], to }))
}

/** A vent for every window starting here, then the piece at its paused rate. */
function stepsOfPiece(
  piece: TimedSegment,
  windows: readonly HeatPauseWindow[],
  floorBp: number,
): HeatStep[] {
  const vents = windows.filter((window) => window.fromTick === piece.from && window.ventBp > 0)
  const active = windows.filter((window) => isOpenAt(window, piece.from))
  const segment = {
    ticks: piece.to - piece.from,
    unitsPerTick: pausedRateOf(piece, active, floorBp),
  }
  if (vents.length === 0) return [segment]
  return [{ keepBp: flooredScaleBp(vents.map(keptShareOf), floorBp) }, segment]
}

function isOpenAt(window: HeatPauseWindow, tick: number): boolean {
  return window.fromTick <= tick && tick < window.untilTick
}

function keptShareOf(window: HeatPauseWindow): number {
  return BASIS_POINTS - window.ventBp
}

/** A rising rate scaled by the open windows, rounded up; a cooling rate as it was. */
function pausedRateOf(
  piece: TimedSegment,
  active: readonly HeatPauseWindow[],
  floorBp: number,
): number {
  if (active.length === 0 || piece.unitsPerTick <= 0) return piece.unitsPerTick
  const gainBp = flooredScaleBp(
    active.map((window) => window.gainBp),
    floorBp,
  )
  return Math.ceil((piece.unitsPerTick * gainBp) / BASIS_POINTS)
}
