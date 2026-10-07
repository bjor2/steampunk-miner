/**
 * The sensing debug actions (feature-slices.md 3.14), read-only, so a browser spec asserts state,
 * never pixels: `getReveals()` is this client's reveal board, what the layer drew and what the
 * passives read; `statPreview(itemId, mark, planet)` an item card's raw lines. Equipping and
 * charges go through the kernel's `setVehicleLoadout` and `features['power-up-core']`.
 */
import type { DebugAction } from '../../debug/debugActionRegistry'
import { drawnRevealQuads } from './scene/revealPresence'
import { useSensingStore } from './store/sensingStore'
import { revealCountsOf } from './systems/revealCounts'
import { statPreview } from './systems/statPreview'

export const sensingDebugActions: Readonly<Record<string, DebugAction>> = {
  getReveals: () => ({
    ok: true,
    ...revealCountsOf(useSensingStore.getState()),
    drawnQuads: drawnRevealQuads(),
  }),
  statPreview: (itemId, mark, planet) => ({
    ok: true,
    preview: statPreview(String(itemId), Number(mark), Number(planet)),
  }),
}
