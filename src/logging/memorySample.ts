/**
 * The `memory_sample` line (#121, logging strategy section 2): what the page, the renderer and the
 * physics hold every 10 s, with how far the run got, so heap can be plotted against progress.
 * Sizes are whole KiB (1024 bytes): floats belong to `perf_sample` alone (#11 value rules), and a
 * KiB is finer than Chromium's heap reading and exact for Rapier's 64 KiB pages. A browser with no
 * heap reading (only Chromium has `performance.memory`) writes no line rather than a made-up one.
 */
import type { PageMemory } from '../shell/pageMemory'
import type { RunEventData } from './eventNames'
import type { RunProgress } from './runProgress'

export type MemorySample = RunEventData<'memory_sample'>

/** What the scene's renderer, physics world and terrain hold now. */
export interface SceneMemory {
  geometries: number
  textures: number
  programs: number
  rigidBodies: number
  colliders: number
  wasmBytes: number
  /** Generated chunks the world keeps for the authority's lookups. */
  chunksCached: number
  /** Chunk meshes the terrain has built, drawn or not. */
  chunksMeshed: number
}

export interface MemoryReadings {
  /** Seconds of frames the sampler has seen. */
  elapsedSeconds: number
  page: PageMemory
  scene: SceneMemory
  progress: RunProgress
}

const BYTES_PER_KIB = 1024

/** Null when the browser gives no heap reading. */
export function memorySampleOf(readings: MemoryReadings): MemorySample | null {
  const { page, scene } = readings
  if (page.jsHeap === null) return null
  return {
    elapsedS: readings.elapsedSeconds,
    jsHeapUsedKB: kibibytesOf(page.jsHeap.usedBytes),
    jsHeapTotalKB: kibibytesOf(page.jsHeap.totalBytes),
    jsHeapLimitKB: kibibytesOf(page.jsHeap.limitBytes),
    wasmKB: kibibytesOf(scene.wasmBytes),
    geometries: scene.geometries,
    textures: scene.textures,
    programs: scene.programs,
    rigidBodies: scene.rigidBodies,
    colliders: scene.colliders,
    chunksCached: scene.chunksCached,
    chunksMeshed: scene.chunksMeshed,
    domNodes: page.domNodes,
    listeners: page.listeners,
    ...readings.progress,
  }
}

function kibibytesOf(bytes: number): number {
  return Math.round(bytes / BYTES_PER_KIB)
}
