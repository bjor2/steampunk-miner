/**
 * The tools the bar shows now, as the local player's replica holds them (ticket 691): every row
 * whose anchor is exposed (#474: owned, `FeatureUnlocked` or a slot that holds an item) and whose
 * face read answers, while the vehicle has the input. The same function on the same state for the
 * bar and its specs.
 */
import { readAuthorityState } from '../../store/authorityLink'
import { useGameStore, type GameState } from '../../store/gameStore'
import { inputLayerOf } from '../../store/presentationSlice'
import type { AuthorityState } from '../../systems/authority/authorityState'
import { toolCellKeyLabelOf } from '../../systems/input/keyTags'
import { actionOfToolRule } from '../../systems/input/toolSlots'
import { isTouchAnchorExposed } from '../../systems/input/touchBindings'
import { toolHoverLinesOf } from '../../systems/views/hoverValues'
import { vehicleItemHoverLineOf } from '../../systems/views/itemCardModel'
import type { ShownTool } from '../../systems/views/toolSlotBar'
import { toolSlotRowOf, toolSlotRows, type ToolSlotRow } from '../registries/toolSlots'

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

/** The key tag of a desktop cell (ticket 768): the key that presses its tool now, or none. */
export function readToolCellKeyLabel(
  game: GameState,
  tool: ShownTool,
  cell: number,
): string | null {
  const row = toolSlotRowOf(tool.rowId)
  if (row === null) return null
  return toolCellKeyLabelOf(cell, actionOfToolRule(row), game.toolTrayPage, game.bindings)
}

/** A desktop cell's hover plate (ticket 768): its name, its item's hover line, its charges. */
export function readToolHoverLines(tool: ShownTool): string[] {
  const { itemId } = tool.face
  const hoverLine =
    itemId === undefined
      ? null
      : vehicleItemHoverLineOf(readAuthorityState(), useGameStore.getState().playerId, itemId)
  return toolHoverLinesOf(tool.face, hoverLine)
}
