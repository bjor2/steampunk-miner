/**
 * The `perf_sample` line (#38 Consequences, #4 budgets): what one second of frames cost, as the
 * perf log records it. Times and the scale are kept to hundredths, so the line stays short and a
 * sample reads the same however the float printed.
 */
import type { RunEventData } from './eventNames'

export type PerfSample = RunEventData<'perf_sample'>

/** The renderer's and the physics' counts for the second just ended. */
export interface FrameCost {
  frameMsP50: number
  frameMsP95: number
  renderScale: number
  drawCalls: number
  triangles: number
  groundBlocks: number
  drawnChunks: number
  groundColliders: number
}

export function perfSampleOf(cost: FrameCost, terrainMsP95: number): PerfSample {
  return {
    frameMsP50: toHundredths(cost.frameMsP50),
    frameMsP95: toHundredths(cost.frameMsP95),
    terrainMsP95: toHundredths(terrainMsP95),
    renderScale: toHundredths(cost.renderScale),
    colliders: cost.groundColliders,
    drawCalls: cost.drawCalls,
    triangles: cost.triangles,
    groundBlocks: cost.groundBlocks,
    chunksLoaded: cost.drawnChunks,
  }
}

function toHundredths(value: number): number {
  return Math.round(value * 100) / 100
}
