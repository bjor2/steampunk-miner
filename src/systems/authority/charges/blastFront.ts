/**
 * The order a live blast clears its tiles in (Technical Director, #154 "expanding front", K6 #189):
 * every tile whose centre lies in the blast's ground disc round the charge tile's centre, nearest
 * first, ties in row order (bottom row first, then left to right), so slice k of a blast is a pure
 * function of the blast and k. The disc is the integer one of `blastDisc.ts` (D1 #860): a tile is
 * in it when `dx² + dy²` is at most the disc's squared tile reach `tilesSq`. The tile count is this
 * in-disc count, not pi r^2: 1,793 tiles at R24, which `BLAST_TILES_PER_TICK` = 64 tiles a tick
 * clear in 29 ticks.
 *
 * The front is walked, never built whole (D1 #860, "deferred stamping per the #840 rows"): a disc a
 * Blast Radius level widens can span the planet, hundreds of millions of tiles. Each row holds two
 * runs out from its middle column, each growing in distance, and a heap merges the runs in front
 * order, so a slice costs its tiles times log(rows). A walk starts at any cursor without the tiles
 * before it: the tiles nearer than a squared distance are counted row by row in closed form, so a
 * binary search finds the cursor's shell. The walk that ended one slice is kept for the next.
 */
import { BLAST_TILES_PER_TICK } from '../../../constants/terrainBudget'
import { MM_PER_METRE } from '../../../constants/physics'

/** A tile of the front: its offset from the charge tile and its squared distance in tiles. */
export interface FrontTile {
  dx: number
  dy: number
  distanceSq: number
}

/** A front being walked: the next tile, and where the walk stands. */
export interface FrontWalk {
  readonly tilesSq: number
  /** The index of the tile `next` answers. */
  position: number
  next(): FrontTile | null
}

/** One row's run out from its middle: `dx` moves by `step` and the distance grows each time. */
interface Run {
  dy: number
  dx: number
  step: -1 | 1
  distanceSq: number
}

/** Walks that ended a slice, by disc and position, so the next slice goes on without a search. */
const parkedWalks = new Map<string, FrontWalk>()
const PARKED_WALKS = 16
const lengthsByReach = new Map<number, number>()
const REMEMBERED_LENGTHS = 64

/** The walk of the disc reaching `tilesSq`, at tile `cursor` of its front. */
export function frontWalkFrom(tilesSq: number, cursor: number): FrontWalk {
  const key = walkKeyOf(tilesSq, cursor)
  const parked = parkedWalks.get(key)
  if (parked === undefined) return walkStartingAt(tilesSq, cursor)
  parkedWalks.delete(key)
  return parked
}

/** Keeps a walk for the slice that continues it. */
export function parkFrontWalk(walk: FrontWalk): void {
  if (parkedWalks.size === PARKED_WALKS) parkedWalks.clear()
  parkedWalks.set(walkKeyOf(walk.tilesSq, walk.position), walk)
}

/** The front's tiles from `cursor` on, as one list: for discs small enough to hold whole. */
export function blastFrontOf(tilesSq: number, cursor = 0): FrontTile[] {
  const walk = walkStartingAt(tilesSq, cursor)
  const tiles: FrontTile[] = []
  for (let tile = walk.next(); tile !== null; tile = walk.next()) tiles.push(tile)
  return tiles
}

/** The tiles in the disc reaching `tilesSq`. */
export function inRadiusCount(tilesSq: number): number {
  const known = lengthsByReach.get(tilesSq)
  if (known !== undefined) return known
  const length = tilesNearerThan(tilesSq, tilesSq + 1)
  if (lengthsByReach.size === REMEMBERED_LENGTHS) lengthsByReach.clear()
  lengthsByReach.set(tilesSq, length)
  return length
}

/** Ticks a blast of this reach takes to clear in solid rock. */
export function ticksToClear(tilesSq: number): number {
  return Math.ceil(inRadiusCount(tilesSq) / BLAST_TILES_PER_TICK)
}

/** The squared distance of front tile `index`: the shell holding it. */
export function frontDistanceSqAt(tilesSq: number, index: number): number {
  return shellOf(tilesSq, index)
}

/** A front tile's distance from the charge tile's centre, floored to whole millimetres. */
export function frontRadiusMm(distanceSq: number): number {
  return Math.floor(Math.sqrt(distanceSq * MM_PER_METRE * MM_PER_METRE))
}

function walkKeyOf(tilesSq: number, position: number): string {
  return `${tilesSq}@${position}`
}

/** Positions a fresh walk: the cursor's shell, every run from it, then the shell's earlier tiles. */
function walkStartingAt(tilesSq: number, cursor: number): FrontWalk {
  const shell = shellOf(tilesSq, cursor)
  const heap = runsFrom(tilesSq, shell)
  heapify(heap)
  const walk = walkOver(tilesSq, heap, cursor)
  for (let skipped = tilesNearerThan(tilesSq, shell); skipped < cursor; skipped++) walk.next()
  walk.position = cursor
  return walk
}

function walkOver(tilesSq: number, heap: Run[], position: number): FrontWalk {
  return {
    tilesSq,
    position,
    next() {
      const run = heap[0]
      if (run === undefined) return null
      const tile = { dx: run.dx, dy: run.dy, distanceSq: run.distanceSq }
      advanceRun(heap, run, tilesSq)
      this.position++
      return tile
    },
  }
}

/** The smallest squared distance whose shell holds tile `index`, or past the front's end. */
function shellOf(tilesSq: number, index: number): number {
  let low = 0
  let high = tilesSq + 1
  while (low < high) {
    const middle = Math.floor((low + high + 1) / 2)
    if (tilesNearerThan(tilesSq, middle) <= index) low = middle
    else high = middle - 1
  }
  return low
}

/** Tiles of the disc with `dx² + dy² < distanceSq`, row by row: `2 floor(√(D - dy² - 1)) + 1`. */
function tilesNearerThan(tilesSq: number, distanceSq: number): number {
  const reach = Math.min(rowReachOf(distanceSq - 1, 0), rowReachOf(tilesSq, 0))
  let count = 0
  for (let dy = -reach; dy <= reach; dy++) count += 2 * rowReachOf(distanceSq - 1, dy) + 1
  return count
}

/** Each row's two runs, from the first tile at least `fromSq` away, that still lie in the disc. */
function runsFrom(tilesSq: number, fromSq: number): Run[] {
  const reach = rowReachOf(tilesSq, 0)
  const runs: Run[] = []
  for (let dy = 0 - reach; dy <= reach; dy++) {
    const last = rowReachOf(tilesSq, dy)
    const first = ceilRootOf(fromSq - dy * dy)
    if (first <= last) runs.push(runOf(dy, first === 0 ? 0 : -first, -1))
    const firstRight = Math.max(1, first)
    if (firstRight <= last) runs.push(runOf(dy, firstRight, 1))
  }
  return runs
}

function runOf(dy: number, dx: number, step: -1 | 1): Run {
  return { dy, dx, step, distanceSq: dx * dx + dy * dy }
}

/** The run steps one tile out, or leaves the heap at the disc's edge. */
function advanceRun(heap: Run[], run: Run, tilesSq: number): void {
  run.dx += run.step
  run.distanceSq = run.dx * run.dx + run.dy * run.dy
  if (run.distanceSq > tilesSq) removeTop(heap)
  else siftDown(heap, 0)
}

/** The largest `|dx|` with `dx² + dy² <= limitSq`, or -1 when the row lies outside. */
function rowReachOf(limitSq: number, dy: number): number {
  const room = limitSq - dy * dy
  return room < 0 ? -1 : floorRootOf(room)
}

/** Exact below 2^52: the double root of a whole number is within one of the answer. */
function floorRootOf(n: number): number {
  const root = Math.floor(Math.sqrt(n))
  if (root * root > n) return root - 1
  return (root + 1) * (root + 1) <= n ? root + 1 : root
}

function ceilRootOf(n: number): number {
  if (n <= 0) return 0
  const root = floorRootOf(n)
  return root * root === n ? root : root + 1
}

/** Front order: nearer first, then the lower row, then the column further left. */
function isBefore(a: Run, b: Run): boolean {
  if (a.distanceSq !== b.distanceSq) return a.distanceSq < b.distanceSq
  if (a.dy !== b.dy) return a.dy < b.dy
  return a.dx < b.dx
}

function heapify(heap: Run[]): void {
  for (let at = Math.floor(heap.length / 2) - 1; at >= 0; at--) siftDown(heap, at)
}

function removeTop(heap: Run[]): void {
  const last = heap.pop() as Run
  if (heap.length === 0) return
  heap[0] = last
  siftDown(heap, 0)
}

function siftDown(heap: Run[], from: number): void {
  let at = from
  for (;;) {
    const smallest = smallestOf(heap, at)
    if (smallest === at) return
    ;[heap[at], heap[smallest]] = [heap[smallest], heap[at]]
    at = smallest
  }
}

function smallestOf(heap: Run[], at: number): number {
  const left = 2 * at + 1
  const right = left + 1
  let smallest = at
  if (left < heap.length && isBefore(heap[left], heap[smallest])) smallest = left
  if (right < heap.length && isBefore(heap[right], heap[smallest])) smallest = right
  return smallest
}
