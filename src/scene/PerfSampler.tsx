/**
 * Hands one second of frame costs to the perf log (#38 Consequences, #4 budgets): the frame p50,
 * p95 and p99 and the long frames the render pipeline measured, the terrain's p95, draw calls,
 * triangles, ground blocks, chunks, colliders, the render scale and the ticks the frame cap dropped
 * since the last sample (ticket 480). Every 10 s of frames it hands
 * over what the scene holds for a memory sample (#121), and every 5 minutes it asks for a debug
 * run's save snapshot (#123). Whether a run records them is the perf log's and the snapshots' call.
 */
import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import { MEMORY_SAMPLE_SECONDS, SAVE_SNAPSHOT_SECONDS } from '../constants/scene'
import { perfSampleOf, type SecondOfSteps } from '../logging/perfSample'
import { readTickDilation } from '../physics/liveFixedStep'
import { recordMemorySample, recordPerfSample } from '../store/perfLog'
import { snapshotSaveOnTimer } from '../store/runSnapshots'
import {
  addFrameSample,
  clearFrameWindow,
  createFrameWindow,
  frameMsAt,
  hasFullSecond,
  type FrameWindow,
} from '../systems/render/frameWindow'
import {
  advanceSampleClock,
  createSampleClock,
  isSampleDue,
  restartSamplePeriod,
  wholeSecondsOf,
  type SampleClock,
} from '../systems/render/sampleClock'
import { renderPresence } from './renderPresence'
import { sceneMemoryNow } from './sceneMemory'

const P95 = 0.95

/** The dropped-tick total the last sample counted up to. */
interface DropMark {
  sampledTotal: number
}

export function PerfSampler() {
  const terrain = useMemo(createFrameWindow, [])
  const drops = useMemo<DropMark>(() => ({ sampledTotal: droppedTotalNow() }), [])
  const memoryClock = useMemo(() => createSampleClock(MEMORY_SAMPLE_SECONDS), [])
  const saveClock = useMemo(() => createSampleClock(SAVE_SNAPSHOT_SECONDS), [])
  useFrame((_, delta) => {
    addFrameSample(terrain, renderPresence.terrainMs, delta)
    recordSecondOfCosts(terrain, drops)
    advanceSampleClock(memoryClock, delta)
    recordMemoryWhenDue(memoryClock)
    advanceSampleClock(saveClock, delta)
    snapshotSaveWhenDue(saveClock)
  })
  return null
}

function recordSecondOfCosts(terrain: FrameWindow, drops: DropMark): void {
  if (!hasFullSecond(terrain)) return
  recordPerfSample(perfSampleOf(renderPresence, secondOfStepsOf(terrain, drops)))
  clearFrameWindow(terrain)
}

/** The terrain's p95 and the ticks dropped since the last sample, which moves the mark on. */
function secondOfStepsOf(terrain: FrameWindow, drops: DropMark): SecondOfSteps {
  const total = droppedTotalNow()
  const ticksDroppedByCap = total - drops.sampledTotal
  drops.sampledTotal = total
  return { terrainMsP95: frameMsAt(terrain, P95), ticksDroppedByCap }
}

function droppedTotalNow(): number {
  return readTickDilation().ticksDroppedByCap
}

function recordMemoryWhenDue(clock: SampleClock): void {
  if (!isSampleDue(clock)) return
  recordMemorySample(sceneMemoryNow, wholeSecondsOf(clock))
  restartSamplePeriod(clock)
}

function snapshotSaveWhenDue(clock: SampleClock): void {
  if (!isSampleDue(clock)) return
  snapshotSaveOnTimer()
  restartSamplePeriod(clock)
}
