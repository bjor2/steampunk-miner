/**
 * The version label (ticket 549) in the corner of the title and pause menus. Held for 1.5 s it is
 * the hidden way into a debug session and its flag panel, on a phone with no URL bar too; in a
 * debug session a tap opens the panel. Players see a version number and nothing else: no menu
 * entry names the panel (HS d on #547). Not a button, so it stays out of the menus' controls.
 */
import { DEBUG_GESTURE_HOLD_MS } from '../../constants/debugGesture'
import { GAME_VERSION } from '../../constants/buildInfo'
import { useGameStore } from '../../store/gameStore'
import { DEBUG_UI_IDS } from './debugUiIds'
import { useLongPress } from './useLongPress'
import styles from './VersionLabel.module.css'

export function VersionLabel() {
  const isMenuOpen = useGameStore((state) => state.titleMenu !== null || state.pauseMenu !== null)
  const isPanelOpen = useGameStore((state) => state.isDevFlagPanelOpen)
  return isMenuOpen && !isPanelOpen ? <HeldVersionLabel /> : null
}

function HeldVersionLabel() {
  const press = useLongPress(enterDebugSession, DEBUG_GESTURE_HOLD_MS)
  return (
    <span
      className={styles.label}
      data-testid={DEBUG_UI_IDS.versionLabel}
      onClick={openPanelInDebugSession}
      {...press}
    >
      v{GAME_VERSION}
    </span>
  )
}

function enterDebugSession(): void {
  useGameStore.getState().enterDebugSessionByGesture()
}

function openPanelInDebugSession(): void {
  if (useGameStore.getState().isDevFlagSessionOn) useGameStore.getState().openDevFlagPanel()
}
