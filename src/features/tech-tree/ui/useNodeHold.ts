/**
 * A node button's touch hold (#161 section 4, mobile): a touch or pen held for
 * `ITEM_CARD_LONG_PRESS_MS` opens the node's card while still down, with the #173 haptic tick; a
 * release, a slide or a cancelled pointer before then leaves the tap to the button's click. The
 * press lives in a ref, never in React state.
 */
import { useEffect, useRef, type MouseEvent, type PointerEvent } from 'react'
import { ITEM_CARD_HAPTIC_MS, ITEM_CARD_LONG_PRESS_MS } from '../../../constants/itemCard'
import { getShell } from '../../../shell/shell'
import { useGameStore } from '../../../store/gameStore'
import {
  hasPressSlid,
  nodePressStartedOn,
  type NodePress,
  type NodePressPoint,
} from '../systems/nodePress'
import { openCardByHold } from './nodeCardHold'

export interface NodeHoldHandlers {
  onPointerDown(event: PointerEvent): void
  onPointerMove(event: PointerEvent): void
  onPointerUp(): void
  onPointerCancel(): void
  onPointerLeave(): void
  onContextMenu(event: MouseEvent): void
}

interface HoldTimer {
  press: NodePress | null
  timer: number | null
}

export function useNodeHold(nodeId: string): NodeHoldHandlers {
  const hold = useRef<HoldTimer>({ press: null, timer: null })
  useEffect(() => () => endHold(hold.current), [])
  return {
    onPointerDown: (event) => startHold(hold.current, nodeId, event),
    onPointerMove: (event) => endHoldIfSlid(hold.current, event),
    onPointerUp: () => endHold(hold.current),
    onPointerCancel: () => endHold(hold.current),
    onPointerLeave: () => endHold(hold.current),
    onContextMenu: (event) => keepMenuOffHeldNode(hold.current, event),
  }
}

function startHold(hold: HoldTimer, nodeId: string, event: PointerEvent): void {
  endHold(hold)
  hold.press = nodePressStartedOn(nodeId, pressPointOf(event))
  if (hold.press === null) return
  hold.timer = window.setTimeout(() => openHeldCard(hold, nodeId), ITEM_CARD_LONG_PRESS_MS)
}

function openHeldCard(hold: HoldTimer, nodeId: string): void {
  hold.timer = null
  openCardByHold(nodeId)
  tickHapticsOnHold()
}

function endHoldIfSlid(hold: HoldTimer, event: PointerEvent): void {
  if (hold.press !== null && hasPressSlid(hold.press, pressPointOf(event))) endHold(hold)
}

function endHold(hold: HoldTimer): void {
  if (hold.timer !== null) window.clearTimeout(hold.timer)
  hold.timer = null
  hold.press = null
}

/** A phone's long-press menu or text selection would cover the card the hold opens. */
function keepMenuOffHeldNode(hold: HoldTimer, event: MouseEvent): void {
  if (hold.press !== null) event.preventDefault()
}

function pressPointOf(event: PointerEvent): NodePressPoint {
  return { pointerType: event.pointerType, x: event.clientX, y: event.clientY }
}

function tickHapticsOnHold(): void {
  if (useGameStore.getState().prefs.haptics) getShell().vibrate(ITEM_CARD_HAPTIC_MS)
}
