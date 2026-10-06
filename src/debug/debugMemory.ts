/**
 * The debug API's memory reads (#119, perf report section 5 item 5): what the game's renderer and
 * physics world hold now, for the memory soak (#99) and the `memory_sample` log line. Plain JSON,
 * read only when called, never logged and never `debugApplied`; like every debug method they answer
 * `{ ok: false, problems }` when there is nothing to read yet.
 */
import { physicsStatsNow, type PhysicsStats } from '../physics/physicsStats'
import { rendererMemoryNow, type RendererMemory } from '../scene/rendererMemory'
import type { DebugResult } from './debugScreens'

export type { PhysicsStats, RendererMemory }

/** `{ geometries, textures, programs }` from three's `renderer.info` of the game's canvas. */
export function readRendererMemory(): DebugResult<RendererMemory> {
  const memory = rendererMemoryNow()
  if (memory === null) return { ok: false, problems: ['no game renderer is drawing'] }
  return { ok: true, ...memory }
}

/** `{ rigidBodies, colliders, wasmBytes }` of the running Rapier world and its WASM memory. */
export function readPhysicsStats(): DebugResult<PhysicsStats> {
  const reading = physicsStatsNow()
  if (!reading.ok) return { ok: false, problems: [reading.problem] }
  return { ok: true, ...reading.stats }
}
