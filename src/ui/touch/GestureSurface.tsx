/** Pinch to zoom and double tap to reset it (#173), on the open screen behind the controls. */
import type { PointerEvent } from 'react'
import { leaveScreen, moveOnScreen, touchScreen } from '../../store/touchRuntime'
import styles from './TouchControls.module.css'

export function GestureSurface() {
  return (
    <div
      className={styles.surface}
      onPointerDown={startTouch}
      onPointerMove={(event) => moveOnScreen(event.pointerId, event.clientX, event.clientY)}
      onPointerUp={(event) => leaveScreen(event.pointerId)}
      onPointerCancel={(event) => leaveScreen(event.pointerId)}
    />
  )
}

function startTouch(event: PointerEvent<HTMLDivElement>): void {
  event.currentTarget.setPointerCapture(event.pointerId)
  touchScreen(event.pointerId, { x: event.clientX, y: event.clientY, atMs: event.timeStamp })
}
