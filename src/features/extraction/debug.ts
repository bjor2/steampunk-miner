/**
 * The extraction debug actions (feature-slices.md 3.14), read-only, so a browser spec asserts
 * state, never pixels: `getTrip()` is the local player's income trip (what the drain moved this
 * trip, the cap it was held to, the card's percent), and `statPreview(itemId, mark, planet)` the
 * item card's raw lines. Equipping and charges go through the kernel's `setVehicleLoadout` and
 * `features['power-up-core']`.
 */
import type { DebugAction } from '../../debug/debugActionRegistry'
import { readAuthorityState } from '../../store/authorityLink'
import { useGameStore } from '../../store/gameStore'
import { incomeTripOf } from './systems/incomeTrip'
import { statPreview } from './systems/statPreview'
import { tripCapUsedPercentOf } from './systems/tripCap'

export const extractionDebugActions: Readonly<Record<string, DebugAction>> = {
  getTrip: () => {
    const trip = incomeTripOf(readAuthorityState(), useGameStore.getState().playerId)
    return { ok: true, trip, usedPercent: tripCapUsedPercentOf(trip) }
  },
  statPreview: (itemId, mark, planet) => ({
    ok: true,
    preview: statPreview(String(itemId), Number(mark), Number(planet)),
  }),
}
