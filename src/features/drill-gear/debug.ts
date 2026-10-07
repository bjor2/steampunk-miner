/**
 * The drill-gear debug actions (feature-slices.md 3.14), read-only, so a browser spec asserts
 * state, never pixels: `getEngaged()` is the local player's drill gear that is switched on and
 * slotted, `getTwinBit()` whether the twin-bit head is mounted and the ahead bearing its last cut
 * latched (`facing`, `left` or `right`, with that cell), and `statPreview(itemId, mark, planet)`
 * the item card's raw lines. Equipping goes
 * through the kernel's `setVehicleLoadout`, charges through `features['power-up-core']`.
 */
import type { DebugAction } from '../../debug/debugActionRegistry'
import { readAuthorityState } from '../../store/authorityLink'
import { useGameStore } from '../../store/gameStore'
import { isToggleEngaged } from '../power-up-core'
import { SHIPPED_DRILL_GEAR } from './systems/drillGearItems'
import { statPreview } from './systems/statPreview'
import { isTwinBitMounted } from './systems/twinBit'

export const drillGearDebugActions: Readonly<Record<string, DebugAction>> = {
  getEngaged: () => ({ ok: true, itemIds: engagedItemIds() }),
  getTwinBit: () => ({ ok: true, ...twinBitOfLocalPlayer() }),
  statPreview: (itemId, mark, planet) => ({
    ok: true,
    preview: statPreview(String(itemId), Number(mark), Number(planet)),
  }),
}

function engagedItemIds(): string[] {
  const state = readAuthorityState()
  const { playerId } = useGameStore.getState()
  return SHIPPED_DRILL_GEAR.filter((item) => isToggleEngaged(state, playerId, item.itemId)).map(
    (item) => item.itemId,
  )
}

function twinBitOfLocalPlayer() {
  const state = readAuthorityState()
  const { playerId } = useGameStore.getState()
  return {
    isMounted: isTwinBitMounted(state, playerId),
    aheadLatch: state.players[playerId]?.vehicle.aheadLatch ?? null,
  }
}
