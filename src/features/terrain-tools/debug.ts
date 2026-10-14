/**
 * The terrain-tools debug actions (feature-slices.md 3.14), read-only, so a browser spec asserts
 * state, never pixels: `getBeacon()` is the local player's live lodestone beacon,
 * `getClampLattice()` the blocks their held lode clamp braces with each one's frozen countdown
 * (ticket 285), `getFoam()` the cells their stabiliser foam holds now, each with the tick it lapses
 * (ticket 381), and `statPreview(itemId, mark, planet)` the item card's raw lines. Equipping and charges go through
 * the kernel's `setVehicleLoadout` and `features['power-up-core']`. `getMagnetFields()` reads what
 * the magnet fields' layer draws now, each field's light and growth (ticket 286), null with the layer
 * unmounted; `timeMagnetFieldFrames(seed, now)` is its slice bench for `npm run bench:render`.
 */
import type { DebugAction } from '../../debug/debugActionRegistry'
import { readAuthorityState } from '../../store/authorityLink'
import { useGameStore } from '../../store/gameStore'
import { timeMagnetFieldFrames } from './magnetFieldsBench'
import { drawnMagnetFields } from './scene/magnetFieldPresence'
import { clampLatticeOf } from './systems/clampLattice'
import { foamedCellsOf } from './systems/stabiliserFoam'
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
  getFoam: () => ({
    ok: true,
    foam: foamedCellsOf(readAuthorityState(), useGameStore.getState().playerId),
  }),
  statPreview: (itemId, mark, planet) => ({
    ok: true,
    preview: statPreview(String(itemId), Number(mark), Number(planet)),
  }),
  getMagnetFields: () => ({ ok: true, fields: drawnMagnetFields() }),
  timeMagnetFieldFrames: timeMagnetFieldFramesOn,
}

/** The slice bench of #286's line raise, timed on the caller's clock. */
function timeMagnetFieldFramesOn(worldSeed: unknown, nowMs: unknown) {
  if (
    !Number.isSafeInteger(worldSeed) ||
    (worldSeed as number) < 0 ||
    typeof nowMs !== 'function'
  ) {
    return {
      ok: false as const,
      problems: ['timeMagnetFieldFrames takes a world seed and a clock'],
    }
  }
  return { ok: true as const, ...timeMagnetFieldFrames(worldSeed as number, nowMs as () => number) }
}
