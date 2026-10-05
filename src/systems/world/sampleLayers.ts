/**
 * Read-only access to every per-sample layer of the ground across chunk borders (decisions #36,
 * #41, #43): the current density, the generated density and the casing grade of any world sample,
 * each chunk's arrays looked up once per reader. Collapse reads through it; edits go through
 * `EditSession`. (The physics' `groundReader` reads density only, blended between samples.)
 */
import type { PlanetParams } from './planetParams'
import { ISO_DENSITY, chunkOfSample, localSampleOf, sampleIndexOf } from './sampleGrid'
import { chunkKey } from './tileGrid'
import {
  currentCasingOfChunk,
  currentDensityOfChunk,
  generatedChunkOf,
  type WorldState,
} from './worldState'

interface ChunkLayers {
  density: Uint8Array
  generated: Uint8Array
  casing: Uint8Array
}

export interface SampleLayers {
  world: WorldState
  params: PlanetParams
  chunks: Map<string, ChunkLayers>
}

export function openSampleLayers(world: WorldState, params: PlanetParams): SampleLayers {
  return { world, params, chunks: new Map() }
}

export function casingAt(layers: SampleLayers, sx: number, sy: number): number {
  return layersAt(layers, sx, sy).casing[indexOf(sx, sy)]
}

/** Solid for the contour and collision: above the iso (#36). */
export function isSolidAt(layers: SampleLayers, sx: number, sy: number): boolean {
  return layersAt(layers, sx, sy).density[indexOf(sx, sy)] > ISO_DENSITY
}

/**
 * Carved air (#43 Rule, S3 default 1): at or below the iso **and** below its generated density, so
 * a generated cave is air but never carved, and a partly cut sample still above the iso is solid.
 */
export function isCarvedAirAt(layers: SampleLayers, sx: number, sy: number): boolean {
  const chunk = layersAt(layers, sx, sy)
  const index = indexOf(sx, sy)
  return chunk.density[index] <= ISO_DENSITY && chunk.density[index] < chunk.generated[index]
}

function layersAt(layers: SampleLayers, sx: number, sy: number): ChunkLayers {
  const cx = chunkOfSample(sx)
  const cy = chunkOfSample(sy)
  const key = chunkKey(cx, cy)
  const known = layers.chunks.get(key)
  if (known !== undefined) return known
  const chunk = {
    density: currentDensityOfChunk(layers.world, layers.params, cx, cy),
    generated: generatedChunkOf(layers.params, cx, cy).density,
    casing: currentCasingOfChunk(layers.world, cx, cy),
  }
  layers.chunks.set(key, chunk)
  return chunk
}

function indexOf(sx: number, sy: number): number {
  return sampleIndexOf(localSampleOf(sx), localSampleOf(sy))
}
