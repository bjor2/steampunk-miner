/**
 * One second of frame times (#38 logging: frame time p50/p95 sampled each second): the render
 * delta of each frame in milliseconds, fed in by the scene, read by the render-scale rule and the
 * perf log. Fixed capacity and in-place sorting, so feeding it every frame allocates nothing.
 */
import { FRAME_WINDOW_CAPACITY } from '../../constants/scene'

export interface FrameWindow {
  frameMs: Float32Array
  count: number
  seconds: number
  /** Scratch for the percentiles. */
  sorted: Float32Array
}

export function createFrameWindow(): FrameWindow {
  return {
    frameMs: new Float32Array(FRAME_WINDOW_CAPACITY),
    count: 0,
    seconds: 0,
    sorted: new Float32Array(FRAME_WINDOW_CAPACITY),
  }
}

/** Past the capacity the oldest frames are overwritten; the window still spans its seconds. */
export function addFrame(window: FrameWindow, dtSeconds: number): void {
  addFrameSample(window, dtSeconds * 1000, dtSeconds)
}

/** A per-frame cost other than the frame itself (the terrain's work), over the frame's `dt`. */
export function addFrameSample(window: FrameWindow, sampleMs: number, dtSeconds: number): void {
  window.frameMs[window.count % FRAME_WINDOW_CAPACITY] = sampleMs
  window.count++
  window.seconds += dtSeconds
}

export function hasFullSecond(window: FrameWindow): boolean {
  return window.seconds >= 1
}

/** The frame time at or under which `share` (0 to 1) of the window's frames came in. */
export function frameMsAt(window: FrameWindow, share: number): number {
  const kept = Math.min(window.count, FRAME_WINDOW_CAPACITY)
  if (kept === 0) return 0
  const sorted = window.sorted.subarray(0, kept)
  sorted.set(window.frameMs.subarray(0, kept))
  sorted.sort()
  return sorted[Math.min(kept - 1, Math.ceil(share * kept) - 1)]
}

export function clearFrameWindow(window: FrameWindow): void {
  window.count = 0
  window.seconds = 0
}
