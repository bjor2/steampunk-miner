/**
 * The effect runs the mounted layer draws (ticket 250), for the debug read: set while the layer
 * is mounted. A plain module record, never React state or the store, because the runs change
 * every frame.
 */
import type { FxRuns } from '../systems/render/powerUpFxFeed'

export const powerUpFxPresence: { runs: FxRuns | null } = { runs: null }

/** Shows the layer's runs until the returned call takes them back. */
export function showFxRuns(runs: FxRuns): () => void {
  powerUpFxPresence.runs = runs
  return () => {
    if (powerUpFxPresence.runs === runs) powerUpFxPresence.runs = null
  }
}
