/**
 * A menu button drawn from a view model's `ScreenButton` (#33 section 6): its id is the
 * `data-testid`, a disabled one carries the authority's refusal as `data-reason`, and pressing it
 * goes to the store's one `pressScreenButton`, the same path `ui_confirm` takes.
 *
 * Tab reaches it and draws its focus ring (#173, so a focus-driven UI stays possible), and the
 * browser's focus and the store's menu focus are one: focusing it moves menu focus here, and menu
 * keys carry the browser's focus along. A key never clicks it, because the game already confirms
 * the focused control from the same Enter or Space; a click or tap presses it.
 */
import { useEffect, useRef, type MouseEvent } from 'react'
import { useGameStore } from '../store/gameStore'
import type { ScreenButton } from '../systems/views/viewParts'
import { VectorIcon } from './VectorIcon'
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
  const ref = useRef<HTMLButtonElement>(null)
  const isDisabled = button.reason !== null
  const isFocused = focusedId === button.id
  useEffect(() => carryKeyboardFocusHere(ref.current, isFocused), [isFocused])
  return (
    <button
      ref={ref}
      type="button"
      className={styles.button}
      data-testid={button.id}
      data-reason={button.reason ?? undefined}
      data-state={state}
      data-focused={isFocused || undefined}
      disabled={isDisabled}
      onMouseDown={keepFocusOnGame}
      onFocus={() => useGameStore.getState().focusControl(button.id)}
      onClick={(event) => pressUnlessFromKey(event, button.id)}
    >
      {button.iconId !== undefined && <VectorIcon iconId={button.iconId} size="menu" />}
      {label}
    </button>
  )
}

function keepFocusOnGame(event: MouseEvent): void {
  event.preventDefault()
}

/** A key's click has `detail` 0; the game's `ui_confirm` has already pressed the button. */
function pressUnlessFromKey(event: MouseEvent, buttonId: string): void {
  if (event.detail === 0) return
  useGameStore.getState().pressScreenButton(buttonId)
}

/** Only while the player is tabbing: a click never leaves a control focused to follow. */
function carryKeyboardFocusHere(element: HTMLButtonElement | null, isFocused: boolean): void {
  const isTabbing = document.activeElement instanceof HTMLButtonElement
  if (isFocused && isTabbing && element !== document.activeElement) element?.focus()
}
