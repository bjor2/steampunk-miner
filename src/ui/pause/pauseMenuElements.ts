/**
 * The pause menu's text on the shared Title+OneLine element (spec #422, pass #429): its first page
 * is a title and one line over Resume, Save game and Settings. The save page is the Ledger on the
 * base sheet since ticket 688 (`ui/ledger/ledgerElements.ts`).
 */
import { SAVE_MENU_TEXT } from '../../systems/views/saveMenuText'
import type { ElementText } from '../../systems/views/uiText'

export const PAUSED_TEXT: ElementText = {
  id: 'pause.paused',
  title: SAVE_MENU_TEXT.pauseMenu.paused,
  oneLine: SAVE_MENU_TEXT.pauseMenu.pausedLine,
  tooltipLines: [],
}
