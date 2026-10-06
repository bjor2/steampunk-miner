/**
 * The adaptive render scale (#38 "4K strategy"): the WebGL canvas renders at
 * `scale x devicePixelRatio` and is upscaled, so 4K costs only what the GPU can afford while the
 * HTML UI stays native. Once per second of frames the p95 frame time steps the scale down 0.1
 * (missed frames) or up 0.1 (every frame met), between a floor and a native render. After a few
 * reversals it settles, like drei's PerformanceMonitor flip-flop fallback. Driven by the render
 * delta only: presentation, never the authority or the digest.
 *
 * The floor (#173, amending #38) is 1080 internal pixels across the short axis or one internal
 * pixel per CSS pixel, whichever is fewer: a 4K TV still floors at 1080p, and a DPR-2 phone can
 * step down to DPR-1 sharpness instead of being pinned at a native render.
 */
import {
  RENDER_SCALE_DECLINE_FRAME_MS,
  RENDER_SCALE_FLOOR_SHORT_AXIS_PX,
  RENDER_SCALE_INCLINE_FRAME_MS,
  RENDER_SCALE_MAX,
  RENDER_SCALE_MAX_FLIP_FLOPS,
  RENDER_SCALE_START,
  RENDER_SCALE_STEP,
} from '../../constants/scene'
import { clearFrameWindow, frameMsAt, hasFullSecond, type FrameWindow } from './frameWindow'

const P95 = 0.95
/** Scales are kept in hundredths, so 0.1 steps never drift (0.75 - 0.1 - 0.1 stays 0.55). */
const HUNDREDTHS = 100

type Step = -1 | 0 | 1

export interface RenderScale {
  scale: number
  floor: number
  /** The last step that changed the scale, for counting reversals. */
  lastStep: Step
  flipFlops: number
  isSettled: boolean
  /** Set by the debug API or a pinned setting: the scale stays here and stops adapting. */
  isPinned: boolean
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
    lastStep: 0,
    flipFlops: 0,
    isSettled: false,
    isPinned: false,
  }
}

/** A resized output moves the floor; the scale is lifted onto it when it now sits below. */
export function refloorRenderScale(state: RenderScale, shortAxis: OutputShortAxis): void {
  state.floor = renderScaleFloorOf(shortAxis)
  state.scale = Math.max(state.scale, state.floor)
}

/** Reads the window once it spans a second, steps the scale, and starts the next window. */
export function adaptRenderScale(state: RenderScale, window: FrameWindow): void {
  if (!hasFullSecond(window)) return
  const step = stepFor(state, frameMsAt(window, P95))
  clearFrameWindow(window)
  applyStep(state, step)
}

/** Holds the scale at `scale` (clamped to the floor and 1), or resumes adapting with `null`. */
export function pinRenderScale(state: RenderScale, scale: number | null): void {
  state.isPinned = scale !== null
  if (scale !== null) state.scale = clampScale(state, roundToHundredth(scale))
}

/** Why `value` cannot pin the render scale; `null` (adapt again) or a number in (0, 1] can. */
export function renderScalePinProblems(value: unknown): string[] {
  const isScale = typeof value === 'number' && value > 0 && value <= RENDER_SCALE_MAX
  if (value === null || isScale) return []
  return [
    `renderScale must be null or a number above 0 and at most 1, got ${JSON.stringify(value)}`,
  ]
}

function stepFor(state: RenderScale, p95FrameMs: number): Step {
  if (state.isPinned || state.isSettled) return 0
  if (p95FrameMs > RENDER_SCALE_DECLINE_FRAME_MS) return -1
  if (p95FrameMs <= RENDER_SCALE_INCLINE_FRAME_MS) return 1
  return 0
}

function applyStep(state: RenderScale, step: Step): void {
  const next = clampScale(state, roundToHundredth(state.scale + step * RENDER_SCALE_STEP))
  if (next === state.scale) return
  if (step === -state.lastStep) state.flipFlops++
  state.lastStep = step
  state.scale = next
  if (state.flipFlops >= RENDER_SCALE_MAX_FLIP_FLOPS) settleLow(state)
}

/** After the last reversal the lower of the two scales is the one that held the frame rate. */
function settleLow(state: RenderScale): void {
  if (state.lastStep === 1) state.scale = roundToHundredth(state.scale - RENDER_SCALE_STEP)
  state.isSettled = true
}

function clampScale(state: RenderScale, scale: number): number {
  return Math.min(RENDER_SCALE_MAX, Math.max(state.floor, scale))
}

function roundToHundredth(scale: number): number {
  return Math.round(scale * HUNDREDTHS) / HUNDREDTHS
}
