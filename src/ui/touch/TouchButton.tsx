/**
 * One round touch button (#173): a glyph with no text, 35% at rest and 80% pressed. A press is the
 * action's key going down, a lift its key coming up, through the touch runtime. The charge size
 * badge (ticket 473) passes its own class and face.
 */
import { useState, type ReactNode } from 'react'
import { ACTION_MAP, actionDefOf, type ActionId } from '../../systems/input/actionMap'
import { pressTouchButton, releaseTouchButton } from '../../store/touchRuntime'
import { hudBoxOf } from '../hud/hudBoxes'
import { touchButtonIdOf } from '../stage/deviceIds'
import styles from './TouchControls.module.css'

export function TouchButton({
  action,
  className = styles.button,
  children,
}: {
  action: ActionId
  className?: string
  children: ReactNode
}) {
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
      className={className}
      data-testid={touchButtonIdOf(action)}
      {...hudBoxOf('control')}
      data-action={action}
      data-pressed={isPressed || undefined}
      aria-label={actionDefOf(ACTION_MAP, action).displayName}
      tabIndex={-1}
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={() => isPressed && release()}
    >
      {children}
    </button>
  )
}
