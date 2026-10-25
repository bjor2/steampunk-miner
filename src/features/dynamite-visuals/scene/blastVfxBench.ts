/**
 * One explosion bench row (D8 ticket 868, the TD's bench row: "sizes 1, 6 and 12 × L = 0, 10 and
 * 1e6, at 360 px, 1280×800 and 1920×1080; frame p95 stays within the #840 limits"): a blast played
 * through the real front pools, its stages from the plan and its fronts a frame at a time as the
 * debug preview plays them, every frame's stepping, emitting and uploading timed on the given clock
 * until the pools are empty and the disc and ring are out. Reached by `bench:purchase-levels`
 * through the slice's `benchBlast` debug action, so the script needs no slice import. The screen
 * scales only the sprites' pixels (printed), not the CPU cost; the GPU's fill is `perf:phone`'s.
 */
import { MM_PER_METRE } from '../../../constants/physics'
import { FRAME_BUDGET_MS } from '../../../constants/scene'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { chargeRadiusMm, chargeTypeOf } from '../../../systems/economy/chargeSizes'
import {
  clearBlastEventQueue,
  createBlastEventQueue,
  queueBlastEvents,
  type BlastEventQueue,
} from '../systems/render/blastEventQueue'
import { previewBlastFrames, widenedRadiusMmOf } from '../systems/render/blastPreview'
import {
  blastVfxPlanOf,
  FULL_EFFECTS,
  stageTotalOf,
  type BlastVfxPlan,
} from '../systems/render/blastVfxPlan'
import { blastVfxSeedOf } from '../systems/render/blastVfxSeed'
import {
  createBlastFrontPools,
  drawBlastFrontPools,
  stepBlastFrontPools,
  throwFront,
  type BlastFrontPools,
} from './blastFrontPools'
import { playBlast } from './blastStages'

/** A screen the row is judged on: its short axis and how many times slower its CPU runs. */
export interface VfxScreen {
  name: string
  shortAxisPixels: number
  cpuSlowdown: number
}

export interface VfxRowLine {
  bench: 'blastVfx'
  row: string
  size: number
  level: number
  band: number
  screen: string
  cpuSlowdown: number
  frames: number
  /** Every frame's stepping, emitting and uploading, ms, the slowdown applied. */
  frameMsP50: number
  frameMsP95: number
  frameMsMax: number
  frameBudgetMs: number
  /** The pieces the stages threw; the layer never holds more than its declared instances. */
  piecesThrown: number
  groundRadiusM: number
  /** The ring's reach and the fireball's widest disc on this screen, pixels. */
  shockwavePx: number
  fireballPx: number
  flashFrames: number
  failures: string[]
}

/** #39's default zoom: 12 m across the screen's short axis. */
const VIEW_SHORT_AXIS_M = 12
/** The blast is played until its pieces have died, at most this many 60 Hz frames. */
const MAX_FRAMES = 60 * 8
const FRAME_SECONDS = 1 / 60
const BENCH_PLANET_SEED = 0x868
const BENCH_GROUND: [number, number, number] = [0.5, 0.4, 0.3]
const AT = { tx: 3, ty: 250 }

export function benchBlastRowOf(
  size: number,
  level: number,
  screen: VfxScreen,
  nowMs: () => number,
): VfxRowLine {
  const pools = createBlastFrontPools()
  const queue = createBlastEventQueue(64)
  const rungMm = chargeRadiusMm(size)
  const groundRadiusMm = widenedRadiusMmOf(rungMm, level)
  const plan = planOf(size, level, groundRadiusMm)
  const frames = previewBlastFrames(AT, size, rungMm, 'plain', level)
  const frameMs = playFrames(pools, queue, frames, plan, nowMs)
  return lineOf(size, level, screen, groundRadiusMm, plan, frameMs)
}

function planOf(size: number, level: number, groundRadiusMm: number): BlastVfxPlan {
  return blastVfxPlanOf({
    size,
    chargeType: chargeTypeOf(size),
    radiusLevel: level,
    groundRadiusMm,
    groundColour: BENCH_GROUND,
    isShowcase: false,
    switches: FULL_EFFECTS,
  })
}

/** One preview frame a frame, then empty frames until the pools are quiet; each frame's ms. */
function playFrames(
  pools: BlastFrontPools,
  queue: BlastEventQueue,
  frames: readonly DomainEvent[][],
  plan: BlastVfxPlan,
  nowMs: () => number,
): number[] {
  const frameMs: number[] = []
  for (let frame = 0; frame < MAX_FRAMES; frame++) {
    const start = nowMs()
    stepBlastFrontPools(pools, FRAME_SECONDS)
    if (frame < frames.length) playFrame(pools, queue, frames[frame], plan)
    drawBlastFrontPools(pools)
    frameMs.push(nowMs() - start)
    if (frame >= frames.length && isQuiet(pools)) break
  }
  return frameMs
}

function playFrame(
  pools: BlastFrontPools,
  queue: BlastEventQueue,
  events: readonly DomainEvent[],
  plan: BlastVfxPlan,
): void {
  queueBlastEvents(queue, events, {
    seedOf: (blastSeq) => blastVfxSeedOf(BENCH_PLANET_SEED, blastSeq),
    groundColourOf: () => BENCH_GROUND,
    isShowcaseOf: () => false,
    noticePurchase: () => undefined,
  })
  for (let at = 0; at < queue.blastCount; at++) playBlast(pools, queue.blasts[at], plan)
  for (let at = 0; at < queue.frontCount; at++) throwFront(pools, queue.fronts[at])
  clearBlastEventQueue(queue)
}

function isQuiet(pools: BlastFrontPools): boolean {
  const { counts } = pools
  return counts.fire === 0 && counts.dust === 0 && !counts.isFlashShown && !counts.isShockwaveShown
}

function lineOf(
  size: number,
  level: number,
  screen: VfxScreen,
  groundRadiusMm: number,
  plan: BlastVfxPlan,
  frameMs: readonly number[],
): VfxRowLine {
  const slow = (ms: number) => rounded(ms * screen.cpuSlowdown)
  const pxPerMetre = screen.shortAxisPixels / VIEW_SHORT_AXIS_M
  const frameMsP95 = slow(percentile(frameMs, 0.95))
  return {
    bench: 'blastVfx',
    row: `vfx.s${size}.L${level}.${screen.name}`,
    size,
    level,
    band: plan.band,
    screen: screen.name,
    cpuSlowdown: screen.cpuSlowdown,
    frames: frameMs.length,
    frameMsP50: slow(percentile(frameMs, 0.5)),
    frameMsP95,
    frameMsMax: slow(Math.max(0, ...frameMs)),
    frameBudgetMs: FRAME_BUDGET_MS,
    piecesThrown: stageTotalOf(plan.counts),
    groundRadiusM: groundRadiusMm / MM_PER_METRE,
    shockwavePx: rounded(plan.shockwave.reachM * pxPerMetre),
    fireballPx: rounded(plan.fireball.endRadiusM * pxPerMetre),
    flashFrames: plan.flash.frames,
    failures: frameMsP95 > FRAME_BUDGET_MS ? ['vfx frame p95 over budget'] : [],
  }
}

function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]
}

function rounded(value: number): number {
  return Math.round(value * 1000) / 1000
}
