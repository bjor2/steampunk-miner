/**
 * The fixed pose track of `digSpeedTrackFixtures.ts` (ticket 514's dig-speed STOP): the TD's probe
 * cut on planet 1, flat or turned 30 degrees round the centre, level or down, its body positions a
 * tick, and the cells along it. Test support; authority maths (whole up vectors, no trig).
 */
import { MM_PER_METRE, TICKS_PER_SECOND, UP_VECTOR_SCALE } from '../../constants/physics'
import { FACING, facingVectorOf, type Facing } from '../vehicle/vehiclePose'
import { bandOfTile } from '../world/planetGeometry'
import type { TilePoint } from '../world/tileGrid'
import { tilesAlong } from './lawWorkFixtures'
import { PARAMS } from './scriptedSession'

export type TrackSection = 'level' | 'down'

/** Flat: up along the dock column; tilted: up turned 30 degrees round the centre. */
export type TrackTilt = 'flat' | 'tilted'

export interface Track {
  speedMps: number
  tilt: TrackTilt
  section: TrackSection
}

/** The probe's start: this far from the centre along the up vector, this far along the right. */
const PROBE_START_MM = { right: -10_000, up: 279_500 }
/** Up vectors, `UP_VECTOR_SCALE` long: 30 degrees is (sin, cos) x 1024, whole (authority maths). */
const UP_OF_TILT: Readonly<Record<TrackTilt, { x: number; y: number }>> = {
  flat: { x: 0, y: UP_VECTOR_SCALE },
  tilted: { x: 512, y: 887 },
}
export const TRACK_LENGTH_MM = 115_000
/** How far across the track cells count. */
export const ACROSS_MM = 3_000

/** A heading in up-vector units, and the body's up. */
export interface TrackFrame {
  start: { x: number; y: number }
  up: { x: number; y: number }
  facing: Facing
  heading: { x: number; y: number }
}

/** The track's start, up and heading at its tilt. */
export function frameOf(track: Track): TrackFrame {
  const up = UP_OF_TILT[track.tilt]
  const right = facingVectorOf(up.x, up.y, FACING.right)
  const start = {
    x: (up.x * PROBE_START_MM.up + right.x * PROBE_START_MM.right) / UP_VECTOR_SCALE,
    y: (up.y * PROBE_START_MM.up + right.y * PROBE_START_MM.right) / UP_VECTOR_SCALE,
  }
  const facing = track.section === 'level' ? FACING.right : FACING.down
  return { start, up, facing, heading: facingVectorOf(up.x, up.y, facing) }
}

/** The ticks the track lasts at its speed: at least 1. */
export function trackTicksOf(track: Track): number {
  return Math.max(1, Math.floor(TRACK_LENGTH_MM / strideMmOf(track)))
}

export function strideMmOf(track: Track): number {
  return (track.speedMps * MM_PER_METRE) / TICKS_PER_SECOND
}

/** The body's position at `tick`, mm, whole. */
export function positionAt(frame: TrackFrame, track: Track, tick: number) {
  const along = strideMmOf(track) * tick
  return {
    x: Math.round(frame.start.x + (frame.heading.x / UP_VECTOR_SCALE) * along),
    y: Math.round(frame.start.y + (frame.heading.y / UP_VECTOR_SCALE) * along),
  }
}

/** The deepest band along the track, read a metre at a time (bands harden with depth). */
export function hardestBandOf(frame: TrackFrame): number {
  let band = 1
  for (let mm = 0; mm <= TRACK_LENGTH_MM; mm += MM_PER_METRE) {
    const at = metresOf(pointAlong(frame, mm))
    band = Math.max(band, bandOfTile(PARAMS, Math.floor(at.x), Math.floor(at.y)))
  }
  return band
}

/** The cells whose centres lie `along` the track from its start and within reach across it. */
export function tilesAlongTrack(
  frame: TrackFrame,
  along: { from: number; to: number },
): TilePoint[] {
  const ends = [along.from, along.to].map((mm) => pointAlong(frame, mm))
  const tiles = tilesAlong(metresOf(ends[0]), metresOf(ends[1]), ACROSS_MM / MM_PER_METRE)
  return tiles.filter((tile) => isWithinStretch(frame, tile, along))
}

function isWithinStretch(
  frame: TrackFrame,
  tile: TilePoint,
  along: { from: number; to: number },
): boolean {
  const dx = (tile.tx + 0.5) * MM_PER_METRE - frame.start.x
  const dy = (tile.ty + 0.5) * MM_PER_METRE - frame.start.y
  const { x: hx, y: hy } = frame.heading
  const ahead = (dx * hx + dy * hy) / UP_VECTOR_SCALE
  const across = Math.abs(dx * hy - dy * hx) / UP_VECTOR_SCALE
  return ahead >= along.from && ahead <= along.to && across <= ACROSS_MM
}

export function pointAlong(frame: TrackFrame, mm: number) {
  return {
    x: frame.start.x + (frame.heading.x / UP_VECTOR_SCALE) * mm,
    y: frame.start.y + (frame.heading.y / UP_VECTOR_SCALE) * mm,
  }
}

export function metresOf(at: { x: number; y: number }) {
  return { x: at.x / MM_PER_METRE, y: at.y / MM_PER_METRE }
}
