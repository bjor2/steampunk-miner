/**
 * One round touch button (#173): a glyph with no text, 35% at rest and 80% pressed. A press is the
 * action's key going down, a lift its key coming up, through the touch runtime.
 */
import { useState } from 'react'
import { ACTION_MAP, actionDefOf, type ActionId } from '../../systems/input/actionMap'
import { pressTouchButton, releaseTouchButton } from '../../store/touchRuntime'
import { touchButtonIdOf } from '../stage/deviceIds'
import { VectorIcon } from '../VectorIcon'
import styles from './TouchControls.module.css'

export function TouchButton({ action, iconId }: { action: ActionId; iconId: string }) {
  const [isPressed, setIsPressed] = useState(false)
  const press = () => {
    setIsPressed(true)
    pressTouchButton(action)
  }
  const release = () => {
    setIsPressed(false)
    releaseTouchButton(action)
  }
  return (
    // Touch only: the keyboard has the keys themselves, so Tab never stops here.
    <button
      type="button"
      className={styles.button}
      data-testid={touchButtonIdOf(action)}
      data-action={action}
      data-pressed={isPressed || undefined}
      aria-label={actionDefOf(ACTION_MAP, action).displayName}
      tabIndex={-1}
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={() => isPressed && release()}
    >
      <VectorIcon iconId={iconId} size="menu" />
    </button>
  )
}
