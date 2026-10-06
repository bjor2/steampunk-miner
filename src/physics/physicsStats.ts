/**
 * What the running Rapier world holds (#119, perf report section 5 item 5): its rigid bodies,
 * colliders and WASM memory, for the debug API's `getPhysicsStats()` and the memory soak. The
 * physics world registers itself on mount; the counts are read only when asked, so a fixed step
 * costs nothing extra.
 */
import type RAPIER from '@dimforge/rapier3d-compat'
import { rapierWasmBytes } from './rapierWasmMemory'

export interface PhysicsStats {
  rigidBodies: number
  colliders: number
  wasmBytes: number
}

/** Why a reading is missing; the debug API lists it as a problem. */
export type PhysicsStatsReading = { ok: true; stats: PhysicsStats } | { ok: false; problem: string }

const running: { world: RAPIER.World | null } = { world: null }

/** Registers the running world; the returned call unregisters it when the world goes. */
export function watchPhysicsWorld(world: RAPIER.World): () => void {
  running.world = world
  return () => {
    if (running.world === world) running.world = null
  }
}

export function physicsStatsNow(): PhysicsStatsReading {
  const wasmBytes = rapierWasmBytes()
  if (running.world === null) return { ok: false, problem: 'no physics world is running' }
  if (wasmBytes === null)
    return { ok: false, problem: "Rapier's WASM memory was not seen when Rapier loaded" }
  return { ok: true, stats: physicsStatsOf(running.world, wasmBytes) }
}

function physicsStatsOf(world: RAPIER.World, wasmBytes: number): PhysicsStats {
  return { rigidBodies: world.bodies.len(), colliders: world.colliders.len(), wasmBytes }
}
