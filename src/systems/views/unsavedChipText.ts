/**
 * The "progress not saved" chip's text (#470 P1-8, ticket 479): shown from a slot write no store
 * took until the next one lands, saying why in the player's words and pointing at Export, which
 * still has the unsaved save in memory.
 */
import type { SaveFailureCause } from '../save/saveWriteFailure'
import { UI_IDS } from './screenIds'
import type { ElementText } from './uiText'

const CAUSE_LINES: Readonly<Record<SaveFailureCause, string>> = {
  quota: 'Storage is full: export the save to keep this progress.',
  security: 'This browser blocks storage: export the save to keep it.',
  other: 'The save could not be written: export it to keep it.',
}

export function unsavedChipTextOf(cause: SaveFailureCause): ElementText {
  return {
    id: UI_IDS.unsavedChip,
    title: 'Progress not saved',
    oneLine: CAUSE_LINES[cause],
    tooltipLines: ['The next save at the dock clears this.'],
  }
}
