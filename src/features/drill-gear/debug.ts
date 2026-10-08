/**
 * The drill-gear debug actions (feature-slices.md 3.14), read-only, so a browser spec asserts
 * state, never pixels: `getEngaged()` is the local player's drill gear that is switched on and
 * slotted, `getTwinBit()` whether the twin-bit head is mounted and the ahead bearing its last cut
 * latched (`facing`, `left` or `right`, with that cell), `getDielectricBit()` whether the
 * dielectric bit is mounted and the kernel finds the drill shielded (ticket 292), and
 * `statPreview(itemId, mark, planet)`
 * the item card's raw lines. `twinBitDiagonal()` writes the scenario `drill-gear.twin-bit-diagonal`
 * (ticket 281) from the next tick as a script, read-only like the haul script (#176): play it with
 * `fastForward(ticks, commands)`, so it replays and logs like any scenario. Equipping goes
 * through the kernel's `setVehicleLoadout`, charges through `features['power-up-core']`.
 */
import type { DebugAction } from '../../debug/debugActionRegistry'
import { readAuthorityState } from '../../store/authorityLink'
import { useGameStore } from '../../store/gameStore'
import { isDrillShielded } from '../../systems/registries/shockShields'
import { isToggleEngaged } from '../power-up-core'
import { isDielectricBitMounted } from './systems/dielectricBit'
import { SHIPPED_DRILL_GEAR } from './systems/drillGearItems'
import { statPreview } from './systems/statPreview'
import { isTwinBitMounted } from './systems/twinBit'
import { TWIN_BIT_DIAGONAL_SCENARIO_ID, twinBitDiagonalScriptOf } from './systems/twinBitDiagonal'

export const drillGearDebugActions: Readonly<Record<string, DebugAction>> = {
  getEngaged: () => ({ ok: true, itemIds: engagedItemIds() }),
  getTwinBit: () => ({ ok: true, ...twinBitOfLocalPlayer() }),
  getDielectricBit: () => ({ ok: true, ...dielectricBitOfLocalPlayer() }),
  twinBitDiagonal: () => ({ ok: true, ...twinBitDiagonalFromNow() }),
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

/** The scenario's script from the next tick, with the `fastForward` ticks that end on its last command. */
function twinBitDiagonalFromNow() {
  const { tick } = readAuthorityState()
  const script = twinBitDiagonalScriptOf(tick + 1)
  return { scenarioId: TWIN_BIT_DIAGONAL_SCENARIO_ID, ticks: script.endTick - tick, ...script }
}

function twinBitOfLocalPlayer() {
  const state = readAuthorityState()
  const { playerId } = useGameStore.getState()
  return {
    isMounted: isTwinBitMounted(state, playerId),
    aheadLatch: state.players[playerId]?.vehicle.aheadLatch ?? null,
  }
}

function dielectricBitOfLocalPlayer() {
  const state = readAuthorityState()
  const { playerId } = useGameStore.getState()
  return {
    isMounted: isDielectricBitMounted(state, playerId),
    isShielded: isDrillShielded(state, playerId),
  }
}
