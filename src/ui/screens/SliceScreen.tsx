/**
 * The kernel shell's slot for a slice's full screen (ticket 211): draws the one the store holds
 * open, over the HUD and the dock screen, and hands it the way back. With none open, or none
 * registered, it draws nothing.
 */
import { useGameStore } from '../../store/gameStore'
import { UI_IDS } from '../ids'
import { screenById } from '../registries/screens'
import styles from './SliceScreen.module.css'

export function SliceScreen() {
  const openScreenId = useGameStore((state) => state.openScreenId)
  const dismissScreen = useGameStore((state) => state.dismissScreen)
  return <SliceScreenView openScreenId={openScreenId} onDismiss={dismissScreen} />
}

export function SliceScreenView({
  openScreenId,
  onDismiss,
}: {
  openScreenId: string | null
  onDismiss: () => void
}) {
  const screen = openScreenId === null ? null : screenById(openScreenId)
  if (screen === null) return null
  const { id, render: Screen } = screen
  return (
    <section className={styles.frame} data-testid={UI_IDS.sliceScreen} data-screen-id={id}>
      <Screen onDismiss={onDismiss} />
    </section>
  )
}
