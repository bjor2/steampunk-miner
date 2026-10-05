/**
 * A menu button drawn from a view model's `ScreenButton` (#33 section 6): its id is the
 * `data-testid`, a disabled one carries the authority's refusal as `data-reason`, and pressing it
 * goes to the store's one `pressScreenButton`, the same path `ui_confirm` takes. Like the kit's
 * Button it never takes browser focus; menu focus is the store's and shows as `data-focused`.
 */
import type { MouseEvent } from 'react'
import { useGameStore } from '../store/gameStore'
import type { ScreenButton } from '../systems/views/viewParts'
import styles from './ScreenButtonView.module.css'

export function ScreenButtonView({
  button,
  focusedId,
  label = button.label,
  state,
}: {
  button: ScreenButton
  focusedId: string | null
  label?: string
  /** A `data-state` the screen names for this button, such as `affordable` or `ready`. */
  state?: string
}) {
  const isDisabled = button.reason !== null
  const isFocused = focusedId === button.id
  return (
    <button
      type="button"
      className={styles.button}
      data-testid={button.id}
      data-reason={button.reason ?? undefined}
      data-state={state}
      data-focused={isFocused || undefined}
      disabled={isDisabled}
      tabIndex={-1}
      onMouseDown={keepFocusOnGame}
      onClick={() => useGameStore.getState().pressScreenButton(button.id)}
    >
      {label}
    </button>
  )
}

function keepFocusOnGame(event: MouseEvent): void {
  event.preventDefault()
}
