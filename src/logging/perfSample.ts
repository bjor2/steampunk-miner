/**
 * The `perf_sample` line (#38 Consequences, #4 budgets, #121 p99 and long tasks, ticket 480 the
 * ticks the frame cap dropped): what one second of frames cost, as the perf log records it. Times
 * and the scale are kept to hundredths, so the line stays short and a sample reads the same
 * however the float printed.
 */
import type { RunEventData } from './eventNames'

export type PerfSample = RunEventData<'perf_sample'>

/** The renderer's and the physics' counts for the second just ended. */
export interface FrameCost {
  frameMsP50: number
  frameMsP95: number
  frameMsP99: number
  longFrames: number
  renderScale: number
  drawCalls: number
  triangles: number
  groundBlocks: number
  drawnChunks: number
  groundColliders: number
}

/** What the second's frames did besides the renderer's counts. */
export interface SecondOfSteps {
  terrainMsP95: number
  /** Due ticks the frame cap cut in this second (`stepsDroppedByCap`). */
  ticksDroppedByCap: number
}

export function perfSampleOf(cost: FrameCost, steps: SecondOfSteps): PerfSample {
  return {
    frameMsP50: toHundredths(cost.frameMsP50),
    frameMsP95: toHundredths(cost.frameMsP95),
    frameMsP99: toHundredths(cost.frameMsP99),
    // A frame over 50 ms is one long task of the frame loop, as the Long Tasks API counts them.
    longTasks: cost.longFrames,
    terrainMsP95: toHundredths(steps.terrainMsP95),
    renderScale: toHundredths(cost.renderScale),
    colliders: cost.groundColliders,
    drawCalls: cost.drawCalls,
    triangles: cost.triangles,
    groundBlocks: cost.groundBlocks,
    chunksLoaded: cost.drawnChunks,
    ticksDroppedByCap: steps.ticksDroppedByCap,
  }
}

function toHundredths(value: number): number {
  return Math.round(value * 100) / 100
}
