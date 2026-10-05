/**
 * The UI kit's button: a brass-outlined control. It never takes keyboard focus, because the game
 * reads keys from the whole window and a focused button would also answer Space or Enter.
 */
import type { MouseEvent } from 'react'
import styles from './Button.module.css'

export function Button({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <button
      type="button"
      className={styles.button}
      tabIndex={-1}
      onMouseDown={keepFocusOnGame}
      onClick={onPress}
    >
      {label}
    </button>
  )
}

function keepFocusOnGame(event: MouseEvent): void {
  event.preventDefault()
}
