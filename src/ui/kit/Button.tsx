/**
 * The UI kit's button: a brass-outlined control. Tab reaches it and draws its focus ring (#173);
 * a click never leaves it focused, so Space and Enter go back to the game afterwards.
 */
import type { MouseEvent } from 'react'
import styles from './Button.module.css'

export function Button({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <button type="button" className={styles.button} onMouseDown={keepFocusOnGame} onClick={onPress}>
      {label}
    </button>
  )
}

function keepFocusOnGame(event: MouseEvent): void {
  event.preventDefault()
}
