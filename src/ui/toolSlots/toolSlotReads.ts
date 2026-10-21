/**
 * The tools the bar shows now, as the local player's replica holds them (ticket 691): every row
 * whose anchor is exposed (#474: owned, `FeatureUnlocked` or a slot that holds an item) and whose
 * face read answers, while the vehicle has the input. The same function on the same state for the
 * bar and its specs.
 */
import { readAuthorityState } from '../../store/authorityLink'
import { useGameStore } from '../../store/gameStore'
import { inputLayerOf } from '../../store/presentationSlice'
import type { AuthorityState } from '../../systems/authority/authorityState'
import { isTouchAnchorExposed } from '../../systems/input/touchBindings'
import type { ShownTool } from '../../systems/views/toolSlotBar'
import { toolSlotRows, type ToolSlotRow } from '../registries/toolSlots'

export function readShownTools(): ShownTool[] {
  const game = useGameStore.getState()
  if (inputLayerOf(game) !== 'vehicle') return []
  const state = readAuthorityState()
  return toolSlotRows().flatMap((row) => shownToolOf(row, state, game.playerId))
}

function shownToolOf(row: ToolSlotRow, state: AuthorityState, playerId: string): ShownTool[] {
  if (!isTouchAnchorExposed(state, playerId, row.anchor)) return []
  const face = row.faceOf(state, playerId)
  return face === null ? [] : [{ rowId: row.id, position: row.position, face }]
}
