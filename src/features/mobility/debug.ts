/**
 * The mobility debug actions (feature-slices.md 3.14), read-only, so a browser spec asserts state,
 * never pixels: `getEffects()` is the local player's running windows, and `statPreview(itemId,
 * mark, planet)` the item card's raw lines. Equipping and charges go through the kernel's
 * `setVehicleLoadout` and `features['power-up-core']`.
 */
import type { DebugAction } from '../../debug/debugActionRegistry'
import { readAuthorityState } from '../../store/authorityLink'
import { useGameStore } from '../../store/gameStore'
import { toCanonical } from '../../systems/money'
import { mobilityOf } from './systems/mobilitySection'
import { statPreview } from './systems/statPreview'

export const mobilityDebugActions: Readonly<Record<string, DebugAction>> = {
  getEffects: () => ({
    ok: true,
    effects: mobilityOf(readAuthorityState(), useGameStore.getState().playerId),
  }),
  statPreview: (itemId, mark, planet) => ({
    ok: true,
    lines: statPreview(String(itemId), Number(mark), Number(planet)).map(({ label, value }) => ({
      label,
      value: toCanonical(value),
    })),
  }),
}
