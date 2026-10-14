/**
 * How the hazard strip reads on screen (Gameplay's proposal 6049828174 with amendment 1 and the GD
 * camera lock on #316, ticket 341): the strip lies along the drive, its pips placed by time to
 * arrival, each labelled with its distance and arrival time. Distances never assume a maximum and
 * switch to compact numbers past 1,000 ("1.2k m", "12.4k m"), so the strip at P100 reads as it does
 * at P10 with only the metre labels grown.
 */
import { STRIP_COMPACT_FROM } from '../../constants/hazardStrip'
import type { Vector2 } from '../vehicle/localFrame'

const COMPACT_SUFFIXES = ['k', 'M', 'G', 'T']
const THOUSAND = 1000

/** A distance label: whole metres under 1,000, then one decimal and a thousands suffix. */
export function stripMetresLabel(metres: number): string {
  if (metres < STRIP_COMPACT_FROM) return `${Math.floor(metres)} m`
  let scaled = metres / THOUSAND
  let suffix = 0
  while (scaled >= THOUSAND && suffix < COMPACT_SUFFIXES.length - 1) {
    scaled /= THOUSAND
    suffix++
  }
  if (scaled >= THOUSAND) return `${metres.toExponential(1)} m`
  return `${truncatedToTenths(scaled)}${COMPACT_SUFFIXES[suffix]} m`
}

/** An arrival label in tenths of a second; a rig at rest arrives never. */
export function stripSecondsLabel(seconds: number): string {
  return Number.isFinite(seconds) ? `${truncatedToTenths(seconds)} s` : '—'
}

/**
 * The drive's direction on screen, radians counter-clockwise from screen up: local up's screen
 * angle (the camera's roll, `cameraPresence`) plus the facing's turn from local up.
 */
export function driveScreenAngle(localUpScreenAngle: number, up: Vector2, facing: Vector2): number {
  return localUpScreenAngle + Math.atan2(facing.y, facing.x) - Math.atan2(up.y, up.x)
}

/** Truncated, never rounded up, so 999.95 m never reads as the next unit. */
function truncatedToTenths(value: number): string {
  return (Math.floor(value * 10) / 10).toFixed(1)
}
