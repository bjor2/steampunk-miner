/**
 * Option B's thinning (ticket 616, the final B bars on #442, as the Horizontal and Vertical
 * Scalers amended them): every carved cell's pop starts on its carve tick while fewer than the
 * rate (12 a second, 8 below 720 px wide; fixed, never scaled with speed) started in the last
 * second. Above it:
 * - a common pop merges into the live pop of its material started inside 0.25 s (its count
 *   badge rises), and is dropped when there is none: commons drop first;
 * - a rare-or-better pop merges the same way, and starts its own pop when there is none, so every
 *   rare material clearing in a 0.25 s window shows at least one pop;
 * - a special block or an artefact is never merged or dropped: one starts a tick, the rest queue
 *   across ticks.
 * Inside a batch specials go first, then rare-or-better, then commons, so the rate's room goes to
 * the rarer finds. Its clock is the authority's tick, so a pop starts at most on the tick its cell
 * was carved. Fixed arrays and a fixed queue: thinning allocates nothing per pop.
 */
import {
  POP_MERGE_WINDOW_SECONDS,
  POP_NARROW_SCREEN_PIXELS,
  POP_RATE_PER_SECOND,
  POP_RATE_PER_SECOND_NARROW,
  POP_RESERVED_SLOTS,
  POP_SPECIALS_PER_TICK,
} from '../../constants/materialPop'
import { TICKS_PER_SECOND } from '../../constants/physics'
import { copyPopFind, createPopFind, type PopFind, type PopLane } from './popFinds'

/** Whoever shows the pops: the spray pool. */
export interface PopSink {
  /** Starts the pop numbered `serial`; false when it found no room. */
  startPop(find: PopFind, serial: number): boolean
  /** One more cell of its material merged into the live pop `serial`. */
  mergeIntoPop(serial: number): void
}

/** What thinning did since the page loaded; `queued` is the specials waiting now. */
export interface PopTally {
  finds: number
  started: number
  merged: number
  dropped: number
  queued: number
  /** The most ticks a drilled pop started after its cell was carved. */
  startLagTicksMost: number
}

export interface PopThinning {
  ratePerSecond: number
  /** The last starts' ticks, a ring: enough to judge the higher rate. */
  startTicks: Int32Array
  startHead: number
  /** Pops a later same-material find may merge into, a ring. */
  openMaterial: string[]
  openSerial: Uint32Array
  openTick: Int32Array
  openHead: number
  /** Specials waiting to start, a ring of reused finds. */
  queue: PopFind[]
  queueHead: number
  queueLength: number
  lastSpecialTick: number
  nextSerial: number
  tally: PopTally
}

const MERGE_TICKS = Math.round(POP_MERGE_WINDOW_SECONDS * TICKS_PER_SECOND)
const RATE_MOST = Math.max(POP_RATE_PER_SECOND, POP_RATE_PER_SECOND_NARROW)
/** Live merge targets: the rate's pops of a window plus each rare material's own, with room. */
const OPEN_MOST = 2 * POP_RESERVED_SLOTS
const NEVER = -TICKS_PER_SECOND - 1
const LANE_ORDER: readonly PopLane[] = ['special', 'guarded', 'common']

export function createPopThinning(): PopThinning {
  return {
    ratePerSecond: POP_RATE_PER_SECOND,
    startTicks: new Int32Array(RATE_MOST).fill(NEVER),
    startHead: 0,
    openMaterial: new Array<string>(OPEN_MOST).fill(''),
    openSerial: new Uint32Array(OPEN_MOST),
    openTick: new Int32Array(OPEN_MOST).fill(NEVER),
    openHead: 0,
    queue: Array.from({ length: POP_RESERVED_SLOTS }, createPopFind),
    queueHead: 0,
    queueLength: 0,
    lastSpecialTick: NEVER,
    nextSerial: 1,
    tally: { finds: 0, started: 0, merged: 0, dropped: 0, queued: 0, startLagTicksMost: 0 },
  }
}

/** The pop rate a screen `widthPixels` wide reads at (HS condition 4). */
export function popRatePerSecondOf(widthPixels: number): number {
  return widthPixels < POP_NARROW_SCREEN_PIXELS ? POP_RATE_PER_SECOND_NARROW : POP_RATE_PER_SECOND
}

/** One carved batch's finds, `finds[0]` to `finds[count - 1]`, thinned at `tick`. */
export function thinPopFinds(
  thinning: PopThinning,
  finds: readonly PopFind[],
  count: number,
  tick: number,
  sink: PopSink,
): void {
  startQueuedSpecial(thinning, tick, sink)
  for (const lane of LANE_ORDER) offerLane(thinning, finds, count, lane, tick, sink)
}

/** A queued special starts once its tick has room; call on every tick or frame. */
export function startQueuedSpecial(thinning: PopThinning, tick: number, sink: PopSink): void {
  if (thinning.queueLength === 0 || !hasSpecialRoom(thinning, tick)) return
  const find = thinning.queue[thinning.queueHead]
  thinning.queueHead = (thinning.queueHead + 1) % thinning.queue.length
  thinning.queueLength--
  thinning.tally.queued = thinning.queueLength
  startSpecial(thinning, find, tick, sink)
}

function offerLane(
  thinning: PopThinning,
  finds: readonly PopFind[],
  count: number,
  lane: PopLane,
  tick: number,
  sink: PopSink,
): void {
  for (let at = 0; at < count; at++) {
    if (finds[at].lane === lane) offerFind(thinning, finds[at], tick, sink)
  }
}

function offerFind(thinning: PopThinning, find: PopFind, tick: number, sink: PopSink): void {
  thinning.tally.finds++
  if (find.lane === 'special') offerSpecial(thinning, find, tick, sink)
  else offerMaterialPop(thinning, find, tick, sink)
}

function offerSpecial(thinning: PopThinning, find: PopFind, tick: number, sink: PopSink): void {
  const isQueueFull = thinning.queueLength === thinning.queue.length
  if (isQueueFull || (thinning.queueLength === 0 && hasSpecialRoom(thinning, tick))) {
    startSpecial(thinning, find, tick, sink)
  } else {
    queueSpecial(thinning, find)
  }
}

function offerMaterialPop(thinning: PopThinning, find: PopFind, tick: number, sink: PopSink): void {
  const open = isUnderRate(thinning, tick) ? -1 : openPopOf(thinning, find.materialId, tick)
  if (open >= 0) mergeInto(thinning, open, sink)
  else if (mayStartOwnPop(thinning, find, tick)) startOwnPop(thinning, find, tick, sink)
  else thinning.tally.dropped++
}

/** Under the rate every pop starts; above it a rare-or-better one with nothing to merge into. */
function mayStartOwnPop(thinning: PopThinning, find: PopFind, tick: number): boolean {
  return find.lane === 'guarded' || isUnderRate(thinning, tick)
}

function hasSpecialRoom(thinning: PopThinning, tick: number): boolean {
  return thinning.lastSpecialTick + POP_SPECIALS_PER_TICK <= tick
}

function startSpecial(thinning: PopThinning, find: PopFind, tick: number, sink: PopSink): void {
  thinning.lastSpecialTick = tick
  startPop(thinning, find, tick, sink)
}

function queueSpecial(thinning: PopThinning, find: PopFind): void {
  const at = (thinning.queueHead + thinning.queueLength) % thinning.queue.length
  copyPopFind(find, thinning.queue[at])
  thinning.queueLength++
  thinning.tally.queued = thinning.queueLength
}

/** A material pop opens a merge window for its material; a special never merges. */
function startOwnPop(thinning: PopThinning, find: PopFind, tick: number, sink: PopSink): void {
  const serial = startPop(thinning, find, tick, sink)
  if (serial !== null) openPop(thinning, find.materialId, serial, tick)
  noteStartLag(thinning.tally, tick - find.tick)
}

function startPop(
  thinning: PopThinning,
  find: PopFind,
  tick: number,
  sink: PopSink,
): number | null {
  const serial = thinning.nextSerial++
  recordStart(thinning, tick)
  if (sink.startPop(find, serial)) {
    thinning.tally.started++
    return serial
  }
  thinning.tally.dropped++
  return null
}

function recordStart(thinning: PopThinning, tick: number): void {
  thinning.startTicks[thinning.startHead] = tick
  thinning.startHead = (thinning.startHead + 1) % thinning.startTicks.length
}

/** Fewer than the rate started in the last second: the rate-th last start is a second old. */
function isUnderRate(thinning: PopThinning, tick: number): boolean {
  const ring = thinning.startTicks.length
  const rateThLast = (thinning.startHead - thinning.ratePerSecond + ring) % ring
  return thinning.startTicks[rateThLast] <= tick - TICKS_PER_SECOND
}

/** The open slot of `materialId`'s pop started inside the merge window, or -1. */
function openPopOf(thinning: PopThinning, materialId: string, tick: number): number {
  for (let at = 0; at < thinning.openMaterial.length; at++) {
    if (thinning.openMaterial[at] !== materialId) continue
    if (thinning.openTick[at] > tick - MERGE_TICKS) return at
  }
  return -1
}

function openPop(thinning: PopThinning, materialId: string, serial: number, tick: number): void {
  const at = thinning.openHead
  thinning.openMaterial[at] = materialId
  thinning.openSerial[at] = serial
  thinning.openTick[at] = tick
  thinning.openHead = (at + 1) % thinning.openMaterial.length
}

function mergeInto(thinning: PopThinning, open: number, sink: PopSink): void {
  sink.mergeIntoPop(thinning.openSerial[open])
  thinning.tally.merged++
}

function noteStartLag(tally: PopTally, lagTicks: number): void {
  tally.startLagTicksMost = Math.max(tally.startLagTicksMost, lagTicks)
}
