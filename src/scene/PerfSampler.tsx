/**
 * Hands one second of frame costs to the perf log (#38 Consequences, #4 budgets): the frame p50
 * and p95 the render pipeline measured, the terrain's p95, draw calls, triangles, ground blocks,
 * chunks, colliders and the render scale. Whether a run records them is the perf log's call.
 */
import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import { perfSampleOf } from '../logging/perfSample'
import { recordPerfSample } from '../store/perfLog'
import {
  addFrameSample,
  clearFrameWindow,
  createFrameWindow,
  frameMsAt,
  hasFullSecond,
  type FrameWindow,
} from '../systems/render/frameWindow'
import { renderPresence } from './renderPresence'

const P95 = 0.95

export function PerfSampler() {
  const terrain = useMemo(createFrameWindow, [])
  useFrame((_, delta) => {
    addFrameSample(terrain, renderPresence.terrainMs, delta)
    recordSecondOfCosts(terrain)
  })
  return null
}

function recordSecondOfCosts(terrain: FrameWindow): void {
  if (!hasFullSecond(terrain)) return
  recordPerfSample(perfSampleOf(renderPresence, frameMsAt(terrain, P95)))
  clearFrameWindow(terrain)
}
