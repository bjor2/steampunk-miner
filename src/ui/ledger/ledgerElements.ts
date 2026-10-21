/**
 * The Ledger's text on the shared Title+OneLine element (spec #422, pass #429; moved from the
 * pause menu's save page by ticket 688): the page is a title and one line over its controls, and a
 * save slot is its save's name with its summary (planet, depth with its core gauge, money; ticket
 * 703) and playtime as glyph plus value and its wall time in the tooltip.
 */
import { hudLabelIconIdOf } from '../../systems/art/icons/iconSet'
import type { SaveSlotRow } from '../../systems/views/pauseMenuModel'
import { fillSaveMenuText, SAVE_MENU_TEXT } from '../../systems/views/saveMenuText'
import type { ElementText } from '../../systems/views/uiText'
import type { IconValue } from '../kit/TitleOneLine'
import { slotSummaryFactsOf } from '../save/slotSummaryFacts'

export const SAVE_PAGE_TEXT: ElementText = {
  id: 'pause.save',
  title: SAVE_MENU_TEXT.savePage.title,
  oneLine: SAVE_MENU_TEXT.savePage.line,
  tooltipLines: [SAVE_MENU_TEXT.savePage.blankNameTip],
}

/** `savedAtText` is the wall time in the player's zone, which only the view knows. */
export function pauseSlotTextOf(row: SaveSlotRow, savedAtText: string): ElementText {
  return {
    id: `pause.slot.${row.slot}`,
    title: row.title,
    oneLine: '',
    tooltipLines: savedAtText === '' ? [] : [savedAtLineOf(savedAtText)],
  }
}

/** The save's summary and its playtime as glyph plus value; nothing for an empty slot. */
export function pauseSlotFactsOf(row: SaveSlotRow): IconValue[] {
  if (row.summary === null) return []
  return [
    ...slotSummaryFactsOf(row.summary),
    { iconId: hudLabelIconIdOf('tile_time'), text: row.playtimeText },
  ]
}

function savedAtLineOf(savedAtText: string): string {
  return fillSaveMenuText(SAVE_MENU_TEXT.slot.savedAt, { savedAt: savedAtText })
}
