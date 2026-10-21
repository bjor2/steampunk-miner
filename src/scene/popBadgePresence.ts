/**
 * Where this frame draws option B's merged pops (ticket 616, the VS count badge on #442): the
 * spray layer writes each pop holding more than its own cell, in planet metres, and the HUD's
 * badge layer reads it after the camera moved. A mutable record of fixed arrays, because it
 * changes every frame and never goes through React or the store.
 */
import { POP_BADGES_MOST } from '../constants/materialPop'

export const popBadgePresence = {
  count: 0,
  x: new Float64Array(POP_BADGES_MOST),
  y: new Float64Array(POP_BADGES_MOST),
  /** Cells merged into the pop, its own included. */
  cells: new Uint16Array(POP_BADGES_MOST),
}

/** Starts a frame's badges. */
export function clearPopBadges(): void {
  popBadgePresence.count = 0
}

/** One merged pop's badge this frame; past the most shown, the rest go unbadged. */
export function showPopBadge(x: number, y: number, cells: number): void {
  const at = popBadgePresence.count
  if (at === POP_BADGES_MOST) return
  popBadgePresence.x[at] = x
  popBadgePresence.y[at] = y
  popBadgePresence.cells[at] = cells
  popBadgePresence.count = at + 1
}
