/**
 * The overflow cell (ticket 691; design-system.md section 10, the overflow tray): shown while a
 * tool waits past the slot cells, a tap turns the cells to the next tray page and, after the last,
 * back to the thumb cells. Lit while the tray is open. UI state only; it presses no action.
 */
import { panelIconIdOf } from '../../systems/art/icons/iconSet'
import type { TrayPaging } from '../../systems/views/toolSlotBar'
import { hudBoxOf } from '../hud/hudBoxes'
import { UI_IDS } from '../ids'
import { VectorIcon } from '../VectorIcon'
import styles from './ToolCell.module.css'

const OVERFLOW_ICON_ID = panelIconIdOf('slots')

export function OverflowCell({ tray, onTurn }: { tray: TrayPaging; onTurn: () => void }) {
  return (
    <div className={styles.slot}>
      <button
        type="button"
        className={styles.cell}
        data-testid={UI_IDS.hudToolOverflow}
        {...hudBoxOf('tool-slot')}
        data-on={tray.page > 0 || undefined}
        data-page={tray.page}
        aria-label="More tools"
        aria-pressed={tray.page > 0}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onTurn}
      >
        <VectorIcon iconId={OVERFLOW_ICON_ID} size="menu" />
      </button>
    </div>
  )
}
