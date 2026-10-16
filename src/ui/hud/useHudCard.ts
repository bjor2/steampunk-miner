/**
 * The tap card of a compact HUD box (#500): a clean tap on the box (one finger, released inside,
 * no drag; `systems/input/cleanTap.ts`) opens the card that shows the box with its words, and
 * the next one closes it. A press on a control or a tappable amount inside is that control's
 * own. UI state only, never a command; a touch that starts outside the box never reaches it.
 */
import { useRef, useState, type PointerEvent } from 'react'
import {
  isCleanTapAt,
  pressAfterMove,
  pressOnLanding,
  type TapPoint,
  type TapPress,
} from '../../systems/input/cleanTap'
import { isTapOwnedByControl } from '../kit/tapTarget'

export interface HudCardHandlers {
  onPointerDown(event: PointerEvent<HTMLElement>): void
  onPointerMove(event: PointerEvent<HTMLElement>): void
  onPointerUp(event: PointerEvent<HTMLElement>): void
  onPointerCancel(): void
}

interface TapTrack {
  press: TapPress | null
  pointersDown: number
}

export function useHudCard(): { isOpen: boolean; handlers: HudCardHandlers } {
  const [isOpen, setIsOpen] = useState(false)
  const track = useRef<TapTrack>({ press: null, pointersDown: 0 })
  const toggle = () => setIsOpen((wasOpen) => !wasOpen)
  return {
    isOpen,
    handlers: {
      onPointerDown: (event) => landPointer(track.current, event),
      onPointerMove: (event) => movePointer(track.current, event),
      onPointerUp: (event) => liftPointer(track.current, event, toggle),
      onPointerCancel: () => forgetPress(track.current),
    },
  }
}

function landPointer(track: TapTrack, event: PointerEvent<HTMLElement>): void {
  const isFirst = track.pointersDown === 0 && !isTapOwnedByControl(event)
  track.press = pressOnLanding(track.press, pointOf(event), isFirst)
  track.pointersDown += 1
}

function movePointer(track: TapTrack, event: PointerEvent<HTMLElement>): void {
  track.press = pressAfterMove(track.press, pointOf(event))
}

function liftPointer(track: TapTrack, event: PointerEvent<HTMLElement>, onTap: () => void): void {
  if (isCleanTapAt(track.press, pointOf(event), isInsideBox(event))) onTap()
  track.pointersDown = Math.max(0, track.pointersDown - 1)
  if (track.pointersDown === 0) track.press = null
}

function forgetPress(track: TapTrack): void {
  track.press = null
  track.pointersDown = 0
}

function pointOf(event: PointerEvent<HTMLElement>): TapPoint {
  return { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
}

/** A touch stays captured by the box it pressed, so the lift says where it really ended. */
function isInsideBox(event: PointerEvent<HTMLElement>): boolean {
  const box = event.currentTarget.getBoundingClientRect()
  const { clientX: x, clientY: y } = event
  return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom
}
