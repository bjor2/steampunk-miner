/**
 * The field lines the mounted layer draws now (#293), for the debug read: set while the layer is
 * mounted. A plain module record, never React state or the store, because the buffer is rewritten
 * from the frame loop.
 */
import type { FieldArcBuffer } from '../systems/render/fieldArcBuffer'

export const fieldArcPresence: { buffer: FieldArcBuffer | null } = { buffer: null }

/** Shows the layer's buffer until the returned call takes it back. */
export function showFieldArcBuffer(buffer: FieldArcBuffer): () => void {
  fieldArcPresence.buffer = buffer
  return () => {
    if (fieldArcPresence.buffer === buffer) fieldArcPresence.buffer = null
  }
}

/** How many arcs the layer drew on its last pick and how often it picked; null with none mounted. */
export function drawnFieldArcs(): { arcs: number; picks: number } | null {
  const buffer = fieldArcPresence.buffer
  return buffer === null ? null : { arcs: buffer.arcCount, picks: buffer.picks }
}
