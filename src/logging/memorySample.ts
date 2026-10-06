/**
 * The `memory_sample` line (#121, logging strategy section 2): what the page, the renderer and the
 * physics hold every 10 s, with how far the run got, so heap can be plotted against progress.
 * Sizes are MiB kept to hundredths, like the times in `perf_sample`. A browser with no heap
 * reading (only Chromium has `performance.memory`) writes no line rather than a made-up one.
 */
import type { PageMemory } from '../shell/pageMemory'
import type { RunEventData } from './eventNames'
import type { RunSummary } from './runSummary'

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

/** How far the run got, from the run summary folded so far. */
export interface RunProgress {
  maxDepthTiles: number
  tilesDestroyed: number
  mineralsCollected: number
  /** Money earned over the run (sales and refined batches), a canonical string. */
  moneyTotal: string
}

export interface MemoryReadings {
  /** Seconds of frames the sampler has seen. */
  elapsedSeconds: number
  page: PageMemory
  scene: SceneMemory
  progress: RunProgress
}

const BYTES_PER_MIB = 1024 * 1024

/** Null when the browser gives no heap reading. */
export function memorySampleOf(readings: MemoryReadings): MemorySample | null {
  const { page, scene } = readings
  if (page.jsHeap === null) return null
  return {
    elapsedS: readings.elapsedSeconds,
    jsHeapUsedMB: mebibytesOf(page.jsHeap.usedBytes),
    jsHeapTotalMB: mebibytesOf(page.jsHeap.totalBytes),
    jsHeapLimitMB: mebibytesOf(page.jsHeap.limitBytes),
    wasmMB: mebibytesOf(scene.wasmBytes),
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

/** Collected units are the minerals; money earned is the progress, not the wallet that is spent. */
export function runProgressOf(summary: RunSummary): RunProgress {
  return {
    maxDepthTiles: summary.maxDepthTiles,
    tilesDestroyed: summary.tilesDestroyed,
    mineralsCollected: summary.resourceUnitsCollected,
    moneyTotal: summary.moneyEarned,
  }
}

function mebibytesOf(bytes: number): number {
  return Math.round((bytes / BYTES_PER_MIB) * 100) / 100
}
