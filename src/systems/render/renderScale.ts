/**
 * The adaptive render scale (#38 "4K strategy"): the WebGL canvas renders at
 * `scale x devicePixelRatio` and is upscaled, so 4K costs only what the GPU can afford while the
 * HTML UI stays native. Once per second of frames the p95 frame time steps the scale down 0.1
 * (missed frames) or up 0.1 (every frame met), between a floor and a ceiling (a native render, or
 * the quality preset's cap). After a few reversals it settles, like drei's PerformanceMonitor
 * flip-flop fallback. Driven by the render delta only: presentation, never the authority or the
 * digest.
 *
 * The floor (#173, amending #38) is 1080 internal pixels across the short axis or one internal
 * pixel per CSS pixel, whichever is fewer: a 4K TV still floors at 1080p, and a DPR-2 phone can
 * step down to DPR-1 sharpness instead of being pinned at a native render.
 *
 * Hysteresis (TD #470 section 2.4, ticket 477): the scale drawn is snapped to three levels (the
 * floor, the ceiling and halfway), so the full-size targets are reallocated only when the scale
 * crosses one; after its first settle it steps at most every 2 s; and a minute after settling it
 * adapts again, so a phone that cooled down gets its sharper render back.
 */
import {
  FRAME_BUDGET_MS,
  RENDER_SCALE_DECLINE_BUDGET_RATIO,
  RENDER_SCALE_FLOOR_SHORT_AXIS_PX,
  RENDER_SCALE_INCLINE_BUDGET_RATIO,
  RENDER_SCALE_MAX,
  RENDER_SCALE_MAX_FLIP_FLOPS,
  RENDER_SCALE_START,
  RENDER_SCALE_STEP,
} from '../../constants/scene'
import {
  RENDER_QUALITY_REPROBE_SECONDS,
  RENDER_SCALE_SETTLED_STEP_SECONDS,
} from '../../constants/renderQuality'
import { clearFrameWindow, frameMsAt, hasFullSecond, type FrameWindow } from './frameWindow'

const P95 = 0.95
/** Scales are kept in hundredths, so 0.1 steps never drift (0.75 - 0.1 - 0.1 stays 0.55). */
const HUNDREDTHS = 100

type Step = -1 | 0 | 1

/** How a second of frames went against the budget: past it, within the jitter of it, or between. */
export type FrameVerdict = 'missed' | 'held' | 'met'

const STEP_OF_VERDICT: Readonly<Record<FrameVerdict, Step>> = { missed: -1, held: 0, met: 1 }

export interface RenderScale {
  scale: number
  floor: number
  /** The highest scale: a native render, or lower under the quality's cap; never under the floor. */
  ceiling: number
  /** The last step that changed the scale, for counting reversals. */
  lastStep: Step
  flipFlops: number
  isSettled: boolean
  /** Set by the debug API or a pinned setting: the scale stays here and stops adapting. */
  isPinned: boolean
  /** Settled at least once: from then on it steps at most every 2 s. */
  hasSettled: boolean
  secondsSinceStep: number
  secondsSettled: number
}

/** The canvas's shorter side in CSS pixels and in the device pixels it outputs (#173 tiers). */
export interface OutputShortAxis {
  cssPixels: number
  devicePixels: number
}

/** The lowest scale that still renders `min(1080, cssPixels)` pixels across the shorter side. */
export function renderScaleFloorOf(shortAxis: OutputShortAxis): number {
  const floorPixels = Math.min(RENDER_SCALE_FLOOR_SHORT_AXIS_PX, shortAxis.cssPixels)
  const floor = Math.min(RENDER_SCALE_MAX, floorPixels / shortAxis.devicePixels)
  return Math.ceil(floor * HUNDREDTHS - 1e-9) / HUNDREDTHS
}

export function createRenderScale(shortAxis: OutputShortAxis): RenderScale {
  const floor = renderScaleFloorOf(shortAxis)
  return {
    scale: Math.max(floor, RENDER_SCALE_START),
    floor,
    ceiling: RENDER_SCALE_MAX,
    lastStep: 0,
    flipFlops: 0,
    isSettled: false,
    isPinned: false,
    hasSettled: false,
    secondsSinceStep: 0,
    secondsSettled: 0,
  }
}

/** A resized output moves the floor; the scale is lifted onto it when it now sits below. */
export function refloorRenderScale(state: RenderScale, shortAxis: OutputShortAxis): void {
  state.floor = renderScaleFloorOf(shortAxis)
  state.ceiling = Math.max(state.ceiling, state.floor)
  state.scale = Math.max(state.scale, state.floor)
}

/** The quality's render scale cap (ticket 477) lowers the ceiling, never under the floor. */
export function capRenderScale(state: RenderScale, cap: number): void {
  state.ceiling = Math.max(state.floor, Math.min(RENDER_SCALE_MAX, cap))
  if (!state.isPinned) state.scale = Math.min(state.scale, state.ceiling)
}

/**
 * Reads the window once it spans a second, steps the scale, and starts the next window; answers
 * how the second went against `frameBudgetMs`, or null while the second is not full.
 */
export function adaptRenderScale(
  state: RenderScale,
  window: FrameWindow,
  frameBudgetMs: number = FRAME_BUDGET_MS,
): FrameVerdict | null {
  if (!hasFullSecond(window)) return null
  const verdict = frameVerdictOf(frameMsAt(window, P95), frameBudgetMs)
  clearFrameWindow(window)
  countSecond(state)
  applyStep(state, stepFor(state, verdict))
  return verdict
}

export function frameVerdictOf(p95FrameMs: number, frameBudgetMs: number): FrameVerdict {
  if (p95FrameMs > frameBudgetMs * RENDER_SCALE_DECLINE_BUDGET_RATIO) return 'missed'
  if (p95FrameMs <= frameBudgetMs * RENDER_SCALE_INCLINE_BUDGET_RATIO) return 'met'
  return 'held'
}

/** Holds the scale at `scale` (clamped to the floor and 1), or resumes adapting with `null`. */
export function pinRenderScale(state: RenderScale, scale: number | null): void {
  state.isPinned = scale !== null
  if (scale !== null) state.scale = clampToOutput(state, roundToHundredth(scale))
}

/** Why `value` cannot pin the render scale; `null` (adapt again) or a number in (0, 1] can. */
export function renderScalePinProblems(value: unknown): string[] {
  const isScale = typeof value === 'number' && value > 0 && value <= RENDER_SCALE_MAX
  if (value === null || isScale) return []
  return [
    `renderScale must be null or a number above 0 and at most 1, got ${JSON.stringify(value)}`,
  ]
}

/**
 * The scale the canvas draws at: a pin exactly, otherwise the nearest of the floor, the ceiling
 * and halfway between (the lower on a tie), so most 0.1 steps reallocate nothing.
 */
export function drawnRenderScaleOf(state: RenderScale): number {
  if (state.isPinned) return state.scale
  return drawnLevelsOf(state).reduce((nearest, level) =>
    Math.abs(level - state.scale) < Math.abs(nearest - state.scale) ? level : nearest,
  )
}

/** Whether the scale has nothing left to give: the quality ladder's turn (ticket 477). */
export function isRenderScaleAtFloor(state: RenderScale): boolean {
  return state.scale <= state.floor
}

/** Floor first, so a tie keeps the lower level. */
function drawnLevelsOf(state: RenderScale): number[] {
  const halfway = roundToHundredth((state.floor + state.ceiling) / 2)
  return [state.floor, halfway, state.ceiling]
}

function countSecond(state: RenderScale): void {
  state.secondsSinceStep++
  if (!state.isSettled) return
  state.secondsSettled++
  if (state.secondsSettled >= RENDER_QUALITY_REPROBE_SECONDS) adaptAgain(state)
}

function adaptAgain(state: RenderScale): void {
  state.isSettled = false
  state.flipFlops = 0
  state.lastStep = 0
  state.secondsSettled = 0
}

function stepFor(state: RenderScale, verdict: FrameVerdict): Step {
  if (state.isPinned || state.isSettled) return 0
  if (state.hasSettled && state.secondsSinceStep < RENDER_SCALE_SETTLED_STEP_SECONDS) return 0
  return STEP_OF_VERDICT[verdict]
}

function applyStep(state: RenderScale, step: Step): void {
  const next = clampScale(state, roundToHundredth(state.scale + step * RENDER_SCALE_STEP))
  if (next === state.scale) return
  if (step === -state.lastStep) state.flipFlops++
  state.lastStep = step
  state.scale = next
  state.secondsSinceStep = 0
  if (state.flipFlops >= RENDER_SCALE_MAX_FLIP_FLOPS) settleLow(state)
}

/** After the last reversal the lower of the two scales is the one that held the frame rate. */
function settleLow(state: RenderScale): void {
  if (state.lastStep === 1) state.scale = roundToHundredth(state.scale - RENDER_SCALE_STEP)
  state.isSettled = true
  state.hasSettled = true
}

function clampScale(state: RenderScale, scale: number): number {
  return Math.min(state.ceiling, Math.max(state.floor, scale))
}

/** A pin answers to the output alone: the floor and a native render, whatever the quality cap. */
function clampToOutput(state: RenderScale, scale: number): number {
  return Math.min(RENDER_SCALE_MAX, Math.max(state.floor, scale))
}

function roundToHundredth(scale: number): number {
  return Math.round(scale * HUNDREDTHS) / HUNDREDTHS
}
