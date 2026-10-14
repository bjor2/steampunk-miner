/**
 * The aetheric debug actions (feature-slices.md 3.14), read-only, so a browser spec asserts state,
 * never pixels: `getWhistle()` is the local player's sounding whistle (null when silent),
 * `getPocket()` their governor's open pocket (null when closed), `getItemHeat()` the item heat
 * gauge as the HUD draws it (null while it is hidden), and `statPreview(itemId, mark, planet)` the
 * item card's raw lines. Equipping and charges go through the kernel's `setVehicleLoadout` and
 * `features['power-up-core']`; a scenario's item heat through `debug.aetheric.setItemHeat`.
 */
import type { DebugAction } from '../../debug/debugActionRegistry'
import { readAuthorityState } from '../../store/authorityLink'
import { useGameStore } from '../../store/gameStore'
import { toCanonical } from '../../systems/money'
import { readItemHeatGauge } from './store/itemHeatReads'
import { pocketOf } from './systems/pocketSection'
import { statPreview } from './systems/statPreview'
import { whistleOf } from './systems/whistleSection'

export const aethericDebugActions: Readonly<Record<string, DebugAction>> = {
  getWhistle: () => ({
    ok: true,
    sounding: whistleOf(readAuthorityState(), useGameStore.getState().playerId).sounding,
  }),
  getPocket: () => ({
    ok: true,
    pocket: pocketOf(readAuthorityState(), useGameStore.getState().playerId).pocket,
  }),
  getItemHeat: () => ({ ok: true, gauge: readItemHeatGauge() }),
  statPreview: (itemId, mark, planet) => ({
    ok: true,
    lines: statPreview(String(itemId), Number(mark), Number(planet)).map(({ label, value }) => ({
      label,
      value: toCanonical(value),
    })),
  }),
}
