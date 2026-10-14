/**
 * The mouse over the game canvas (ticket 345, the #314 TD lock section 2): browser plumbing both
 * shells share. Its buttons arrive as the key codes `MouseLeft`/`MouseRight`, so binding,
 * rebinding capture and any-layer release reuse the key path; a press on HUD DOM never reaches
 * the game, a release anywhere does. The cursor is read in the canvas's CSS pixels, mouse only.
 */
import type { CanvasPointer, KeyChange } from './shell'

/** `PointerEvent.buttons` bits and the key code each one presses. */
const BUTTON_CODES: readonly { bit: number; code: string }[] = [
  { bit: 1, code: 'MouseLeft' },
  { bit: 2, code: 'MouseRight' },
]

/** A mouse button's edge, before it becomes a `KeyChange`. */
export interface MouseButtonEdge {
  code: string
  isDown: boolean
}

/**
 * The edges between two `buttons` readings: a button released anywhere comes up, one pressed
 * comes down only over the canvas. One event can carry two edges, as a chorded press does.
 */
export function mouseButtonEdgesOf(
  previousButtons: number,
  buttons: number,
  isOnCanvas: boolean,
): MouseButtonEdge[] {
  return BUTTON_CODES.filter(({ bit }) => (previousButtons & bit) !== (buttons & bit))
    .map(({ bit, code }) => ({ code, isDown: (buttons & bit) !== 0 }))
    .filter((edge) => isOnCanvas || !edge.isDown)
}

/** Reports the canvas's mouse buttons as key changes; returns an unsubscribe. */
export function listenForMouseButtons(listener: (key: KeyChange) => void): () => void {
  let buttons = 0
  const onPointer = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return
    const edges = mouseButtonEdgesOf(buttons, event.buttons, isOverCanvas(event))
    buttons = event.buttons
    edges.forEach((edge) => listener(keyChangeOfMouse(edge, event.shiftKey)))
  }
  const pointerEvents = ['pointerdown', 'pointermove', 'pointerup'] as const
  pointerEvents.forEach((name) => window.addEventListener(name, onPointer, { capture: true }))
  window.addEventListener('contextmenu', keepContextMenuOffCanvas)
  return () => {
    pointerEvents.forEach((name) => window.removeEventListener(name, onPointer, { capture: true }))
    window.removeEventListener('contextmenu', keepContextMenuOffCanvas)
  }
}

/** Keeps the newest mouse position over the canvas; any other pointer or target clears it. */
export function trackCanvasPointer(): () => CanvasPointer | null {
  let pointer: CanvasPointer | null = null
  const onPointer = (event: PointerEvent) => {
    pointer = canvasPointerOf(event)
  }
  window.addEventListener('pointermove', onPointer, { capture: true, passive: true })
  window.addEventListener('pointerdown', onPointer, { capture: true, passive: true })
  return () => pointer
}

function canvasPointerOf(event: PointerEvent): CanvasPointer | null {
  if (event.pointerType !== 'mouse' || !isOverCanvas(event)) return null
  return { x: event.offsetX, y: event.offsetY }
}

function keyChangeOfMouse(edge: MouseButtonEdge, isShiftHeld: boolean): KeyChange {
  return { code: edge.code, isDown: edge.isDown, isRepeat: false, isShiftHeld }
}

/** The right button is a binding on the canvas, so the browser's menu stays off it. */
function keepContextMenuOffCanvas(event: MouseEvent): void {
  if (isOverCanvas(event)) event.preventDefault()
}

/** The game scene is the page's only canvas (`GameScene`; the bay preview's is a menu layer). */
function isOverCanvas(event: Event): boolean {
  return event.target instanceof HTMLCanvasElement
}
