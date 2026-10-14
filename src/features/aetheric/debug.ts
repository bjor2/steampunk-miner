/**
 * The aetheric debug actions (feature-slices.md 3.14), read-only, so a browser spec asserts state,
 * never pixels: `getWhistle()` is the local player's sounding whistle (null when silent), and
 * `statPreview(itemId, mark, planet)` the item card's raw lines. Equipping and charges go through
 * the kernel's `setVehicleLoadout` and `features['power-up-core']`.
 */
import type { DebugAction } from '../../debug/debugActionRegistry'
import { readAuthorityState } from '../../store/authorityLink'
import { useGameStore } from '../../store/gameStore'
import { toCanonical } from '../../systems/money'
import { statPreview } from './systems/statPreview'
import { whistleOf } from './systems/whistleSection'

export const aethericDebugActions: Readonly<Record<string, DebugAction>> = {
  getWhistle: () => ({
    ok: true,
    sounding: whistleOf(readAuthorityState(), useGameStore.getState().playerId).sounding,
  }),
  statPreview: (itemId, mark, planet) => ({
    ok: true,
    lines: statPreview(String(itemId), Number(mark), Number(planet)).map(({ label, value }) => ({
      label,
      value: toCanonical(value),
    })),
  }),
}
