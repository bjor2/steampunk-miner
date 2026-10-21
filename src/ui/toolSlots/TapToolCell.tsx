/**
 * The kernel's cell for a tool whose press is a tap (ticket 691): a press is the action's key
 * going down, a lift its key coming up, through the touch runtime, as the cluster's buttons press
 * (#173). The guns toggle draws this; Plant charge draws it with its size badge riding it.
 */
import { useState, type ReactNode } from 'react'
import type { ActionId } from '../../systems/input/actionMap'
import type { ToolFace } from '../../systems/input/toolSlots'
import { pressTouchButton, releaseTouchButton } from '../../store/touchRuntime'
import { touchButtonIdOf } from '../stage/deviceIds'
import { ToolCell } from './ToolCell'

export function TapToolCell({
  face,
  action,
  children,
}: {
  face: ToolFace
  action: ActionId
  children?: ReactNode
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
    <ToolCell
      face={face}
      testId={touchButtonIdOf(action)}
      isPressed={isPressed}
      pointer={{
        onPointerDown: press,
        onPointerUp: release,
        onPointerCancel: release,
        onPointerLeave: () => isPressed && release(),
      }}
    >
      {children}
    </ToolCell>
  )
}
