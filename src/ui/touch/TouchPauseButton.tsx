/**
 * The pause button while diving (#470 P1-1, ticket 472): small, on the top edge, apart from the
 * thumb's cluster so a drive never brushes it. It presses the pause menu's action as Escape does;
 * the docked screen has its own settings button.
 */
import { PAUSE_ACTION_ID, PAUSE_ICON_ID } from '../../systems/input/touchControls'
import { DEVICE_UI_IDS } from '../stage/deviceIds'
import { TouchButton } from './TouchButton'
import styles from './TouchControls.module.css'

export function TouchPauseButton() {
  return (
    <div className={styles.pause} data-testid={DEVICE_UI_IDS.touchPause}>
      <TouchButton action={PAUSE_ACTION_ID} iconId={PAUSE_ICON_ID} />
    </div>
  )
}
