/**
 * The swept span per chunk (ticket 374, the TD lock on #374 after 6050644115 on #316): a stamp's
 * samples walked as row runs cut at chunk borders, so each run lies inside one chunk.
 *
 * - **The same samples, weights and order as `discSamplesOf`**: rows bottom to top, each row left
 *   to right. A carve over the span is the carve over the stamp's rows byte for byte: densities,
 *   yields, the order the gates are asked in and the order its chunks change in.
 * - **Cost**: a row's run is found from the path, so the walk visits only the samples inside the
 *   stamp and the two just past each run's ends, never the stamp's bounding square, which grows
 *   with the square of a diagonal sweep's length.
 * - **A row is one run**: a capsule is convex, so its samples on a row are contiguous. The run is
 *   seeded where the path is nearest the row (where it crosses the row, else the end nearest it):
 *   that point lies in the stamp whenever the row does, and so does the sample beside it on one
 *   side or the other whenever the row holds any sample. The radius test is exact while the
 *   capsule's squares stay under 2^53, a path up to about 100 m; past that it is still
 *   deterministic on every machine, as the row walk is.
 */
import { carveEachSample, type StampWalk } from './groundEdit'
import { chunkOfSample, MM_PER_SAMPLE, SAMPLES_PER_TILE } from './sampleGrid'
import {
  isWithinStampAt,
  stampRowsOf,
  stampSampleAt,
  tailOf,
  type DiscStamp,
  type SampleRange,
  type WeightedSample,
} from './stampShape'

/** One row's samples of the stamp inside chunk `(cx, cy)`, left to right. */
export interface SpanRun {
  cx: number
  cy: number
  samples: WeightedSample[]
}

/** The swept span's walk: each run in turn, in row order, through the same carve as the rows. */
export const walkStampPerChunk: StampWalk = (session, disc, window, drillTicksOf) =>
  spanRunsOf(disc).reduce(
    (ticks, run) => Math.max(ticks, carveEachSample(session, run.samples, window, drillTicksOf)),
    0,
  )

/** The stamp's samples as runs, row by row, each row's cut at the chunk borders it crosses. */
export function spanRunsOf(disc: DiscStamp): SpanRun[] {
  const rows = stampRowsOf(disc)
  const runs: SpanRun[] = []
  for (let sy = rows.first; sy <= rows.last; sy++) runs.push(...chunkRunsOfRow(disc, sy))
  return runs
}

function chunkRunsOfRow(disc: DiscStamp, sy: number): SpanRun[] {
  const extent = rowExtentOf(disc, sy)
  return extent === null ? [] : runsAcrossChunks(disc, sy, extent)
}

/**
 * The cells a stamp's samples lie in, beside the `seeded` cells (keys `tx,ty`), counted row by row
 * and stopping once past `cap` (ticket 335): `cap + 1` then stands for any count over it, so a long
 * span never pays for the whole count. The same samples `discSamplesOf` lists, so the same cells.
 */
export function stampCellsUpTo(disc: DiscStamp, seeded: ReadonlySet<string>, cap: number): number {
  const cells = new Set(seeded)
  const rows = stampRowsOf(disc)
  for (let sy = rows.first; sy <= rows.last && cells.size <= cap; sy++) {
    addCellsOfRow(cells, disc, sy)
  }
  return Math.min(cells.size, cap + 1)
}

function addCellsOfRow(cells: Set<string>, disc: DiscStamp, sy: number): void {
  const extent = rowExtentOf(disc, sy)
  if (extent === null) return
  const ty = Math.floor(sy / SAMPLES_PER_TILE)
  for (let sx = extent.first; sx <= extent.last; sx++) {
    if (stampSampleAt(disc, sx, sy) !== null)
      cells.add(`${Math.floor(sx / SAMPLES_PER_TILE)},${ty}`)
  }
}

/** The row's samples within the stamp's radius, or null when it holds none. */
function rowExtentOf(disc: DiscStamp, sy: number): SampleRange | null {
  const seed = seedSampleOf(disc, sy)
  if (seed === null) return null
  let first = seed
  while (isWithinStampAt(disc, first - 1, sy)) first--
  let last = seed
  while (isWithinStampAt(disc, last + 1, sy)) last++
  return { first, last }
}

/** A sample of the row inside the stamp, beside the path's point nearest the row; else null. */
function seedSampleOf(disc: DiscStamp, sy: number): number | null {
  const sx = Math.floor(pathXNearestRow(disc, sy * MM_PER_SAMPLE) / MM_PER_SAMPLE)
  if (isWithinStampAt(disc, sx, sy)) return sx
  return isWithinStampAt(disc, sx + 1, sy) ? sx + 1 : null
}

/** In whole mm: where the path crosses the row, or the x of the path's end nearest it. */
function pathXNearestRow(disc: DiscStamp, rowYMm: number): number {
  const tail = tailOf(disc)
  const run = { x: disc.xMm - tail.xMm, y: disc.yMm - tail.yMm }
  if (run.y === 0) return tail.xMm
  const rise = Math.min(Math.max(rowYMm - tail.yMm, Math.min(0, run.y)), Math.max(0, run.y))
  return tail.xMm + Math.floor((rise * run.x) / run.y)
}

/** The row's samples in its extent, a new run at each chunk border it crosses. */
function runsAcrossChunks(disc: DiscStamp, sy: number, extent: SampleRange): SpanRun[] {
  const runs: SpanRun[] = []
  const cy = chunkOfSample(sy)
  for (let sx = extent.first; sx <= extent.last; sx++) {
    const sample = stampSampleAt(disc, sx, sy)
    if (sample === null) continue
    const cx = chunkOfSample(sx)
    const last = runs.at(-1)
    if (last?.cx === cx) last.samples.push(sample)
    else runs.push({ cx, cy, samples: [sample] })
  }
  return runs
}
