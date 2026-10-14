/**
 * The strip's rolling cache of scanned stretches (TD scope g 2 on #316, ticket 341): segments in
 * step order that never overlap, dropped once the rig has passed them or when a chunk they read
 * has new edits. Uncovered steps of the window are its gaps; a coarse segment is refined from its
 * near end with whatever budget a frame has left.
 */
import type { StripGround } from './stripGround'
import { stepHitOf, type StepHit } from './stripHits'
import type { StripSegment } from './stripScan'
import { STRIP_TIER, type StripTier } from './stripTiers'

/** Scans steps `[from, to)` at a tier into a segment. */
export type ScanStretch = (from: number, to: number, tier: StripTier) => StripSegment

/** Drops the segments wholly behind `step`, in place. */
export function dropPassedSegments(segments: StripSegment[], step: number): void {
  const passed = segments.findIndex((segment) => segment.to > step)
  segments.splice(0, passed === -1 ? segments.length : passed)
}

/** Drops every segment that read a chunk whose edits have changed since, in place. */
export function dropEditedSegments(segments: StripSegment[], ground: StripGround): void {
  for (let at = segments.length - 1; at >= 0; at--) {
    if (hasEditedChunk(segments[at], ground)) segments.splice(at, 1)
  }
}

/** Steps of `[from, to)` no segment covers. */
export function gapStepsWithin(segments: readonly StripSegment[], from: number, to: number) {
  let covered = 0
  for (const segment of segments) {
    covered += Math.max(0, Math.min(segment.to, to) - Math.max(segment.from, from))
  }
  return Math.max(0, to - from - covered)
}

/** Scans every gap of `[from, to)` at `tier`, keeping the segments in step order. */
export function fillGaps(
  segments: StripSegment[],
  window: { from: number; to: number },
  tier: StripTier,
  scan: ScanStretch,
): void {
  let cursor = window.from
  for (let at = 0; at <= segments.length && cursor < window.to; at++) {
    const next = segments[at]
    const gapEnd = Math.min(next === undefined ? window.to : next.from, window.to)
    if (gapEnd > cursor) segments.splice(at++, 0, scan(cursor, gapEnd, tier))
    if (next !== undefined) cursor = Math.max(cursor, next.to)
  }
}

/**
 * Rescans up to `steps` metres of the nearest coarse segment in `[from, to)` exactly, splitting
 * it; answers the metres rescanned, 0 when every segment there is exact already.
 */
export function refineNearestCoarse(
  segments: StripSegment[],
  window: { from: number; to: number },
  steps: number,
  scan: ScanStretch,
): number {
  const at = segments.findIndex((segment) => isCoarseWithin(segment, window))
  if (at === -1 || steps <= 0) return 0
  const coarse = segments[at]
  const start = Math.max(coarse.from, window.from)
  const end = Math.min(coarse.to, start + steps)
  segments.splice(at, 1, ...splitAround(coarse, scan(start, end, STRIP_TIER.exact)))
  return end - start
}

/** The coarsest tier any segment over `[from, to)` was scanned at; exact with none. */
export function coarsestTierWithin(
  segments: readonly StripSegment[],
  window: { from: number; to: number },
): StripTier {
  let tier: StripTier = STRIP_TIER.exact
  for (const segment of segments) {
    if (isOverlapping(segment, window) && segment.tier > tier) tier = segment.tier
  }
  return tier
}

/** The hit at `step` of a segment covering it: the last change at or before it. */
export function hitAtStep(segment: StripSegment, step: number): StepHit {
  let found = segment.hits[0]
  for (const hit of segment.hits) {
    if (hit.step > step) break
    found = hit
  }
  return found
}

/** The coarse segment's head and tail around an exact rescan of part of it. */
function splitAround(coarse: StripSegment, exact: StripSegment): StripSegment[] {
  const parts = [exact]
  if (exact.from > coarse.from) parts.unshift(headOf(coarse, exact.from))
  if (exact.to < coarse.to) parts.push(tailOf(coarse, exact.to))
  return parts
}

function headOf(segment: StripSegment, to: number): StripSegment {
  return { ...segment, to, hits: segment.hits.filter((hit) => hit.step < to) }
}

/** The tail keeps the hit standing at its new start, so a run cut in two still shows. */
function tailOf(segment: StripSegment, from: number): StripSegment {
  const standing = stepHitOf(from, hitAtStep(segment, from))
  const later = segment.hits.filter((hit) => hit.step > from)
  return { ...segment, from, hits: [standing, ...later] }
}

function hasEditedChunk(segment: StripSegment, ground: StripGround): boolean {
  return segment.chunks.some((read) => ground.chunkVersionOf(read.cx, read.cy) !== read.version)
}

function isCoarseWithin(segment: StripSegment, window: { from: number; to: number }): boolean {
  return segment.tier !== STRIP_TIER.exact && isOverlapping(segment, window)
}

function isOverlapping(segment: StripSegment, window: { from: number; to: number }): boolean {
  return segment.from < window.to && segment.to > window.from
}
