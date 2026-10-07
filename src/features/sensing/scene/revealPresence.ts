/**
 * The quads the mounted reveal layer draws now (#203), for the debug read: set while the layer is
 * mounted. A plain module record, never React state or the store, because the pool is rewritten
 * from the frame loop.
 */
import type { InstancedMesh } from 'three'

export const revealPresence: { mesh: InstancedMesh | null } = { mesh: null }

/** Shows the layer's pool until the returned call takes it back. */
export function showRevealPool(pool: { mesh: InstancedMesh }): () => void {
  revealPresence.mesh = pool.mesh
  return () => {
    if (revealPresence.mesh === pool.mesh) revealPresence.mesh = null
  }
}

/** How many quads the layer drew on its last write; null with no layer mounted. */
export function drawnRevealQuads(): number | null {
  return revealPresence.mesh?.count ?? null
}
