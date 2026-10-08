/**
 * The terrain-tools debug actions (feature-slices.md 3.14), read-only, so a browser spec asserts
 * state, never pixels: `getBeacon()` is the local player's live lodestone beacon,
 * `getClampLattice()` the blocks their held lode clamp braces with each one's frozen countdown
 * (ticket 285), and `statPreview(itemId, mark, planet)` the item card's raw lines. Equipping and charges go through
 * the kernel's `setVehicleLoadout` and `features['power-up-core']`.
 */
import type { DebugAction } from '../../debug/debugActionRegistry'
import { readAuthorityState } from '../../store/authorityLink'
import { useGameStore } from '../../store/gameStore'
import { clampLatticeOf } from './systems/clampLattice'
import { statPreview } from './systems/statPreview'
import { terrainToolsOf } from './systems/terrainSection'

export const terrainToolsDebugActions: Readonly<Record<string, DebugAction>> = {
  getBeacon: () => ({
    ok: true,
    beacon: terrainToolsOf(readAuthorityState(), useGameStore.getState().playerId).beacon,
  }),
  getClampLattice: () => ({
    ok: true,
    lattice: clampLatticeOf(readAuthorityState(), useGameStore.getState().playerId),
  }),
  statPreview: (itemId, mark, planet) => ({
    ok: true,
    preview: statPreview(String(itemId), Number(mark), Number(planet)),
  }),
}
