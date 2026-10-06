/**
 * What the scene holds, for the `memory_sample` line (#121): the renderer's geometries, textures
 * and programs, the physics world's bodies, colliders and WASM memory, the world's generated
 * chunks and the terrain's built chunk meshes. Read through the same seams as the debug API's
 * memory reads (#119), only when a sample is due.
 */
import type { SceneMemory } from '../logging/memorySample'
import { physicsStatsNow } from '../physics/physicsStats'
import { cachedChunkCount } from '../systems/world/worldState'
import { rendererMemoryNow } from './rendererMemory'
import { renderPresence } from './renderPresence'

/** Null while the renderer or the physics world is not up. */
export function sceneMemoryNow(): SceneMemory | null {
  const renderer = rendererMemoryNow()
  const physics = physicsStatsNow()
  if (renderer === null || !physics.ok) return null
  return {
    ...renderer,
    ...physics.stats,
    chunksCached: cachedChunkCount(),
    chunksMeshed: renderPresence.builtChunks,
  }
}
