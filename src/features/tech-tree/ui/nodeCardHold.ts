/**
 * A long press on a node opens its card while the finger is still down (#161 section 4, mobile).
 * The card replaces the list under the finger, so the click that ends the press would land on
 * whatever the card put there, the Research button included; the screen swallows that one click.
 * The latch is per-gesture state, so it lives here and not in the store (frame-state rule 5).
 */
import { useTreeScreenStore } from '../store/treeScreenStore'

interface CancellableEvent {
  preventDefault(): void
  stopPropagation(): void
}

const latch = { isClickOwedToHold: false }

export function openCardByHold(nodeId: string): void {
  latch.isClickOwedToHold = true
  useTreeScreenStore.getState().selectNode(nodeId)
}

/**
 * A new press on the screen: a hold whose ending click never came (the browser drops it when the
 * pressed node is gone) must not eat this press's click.
 */
export function forgetHoldOnNewPress(): void {
  latch.isClickOwedToHold = false
}

/** A phone's long-press menu would cover the card the hold just opened. */
export function keepMenuOffAfterHold(event: CancellableEvent): void {
  if (latch.isClickOwedToHold) event.preventDefault()
}

/** The click that ends a hold only lifted the finger: nothing under it acts. */
export function swallowClickAfterHold(event: CancellableEvent): void {
  if (!latch.isClickOwedToHold) return
  latch.isClickOwedToHold = false
  event.stopPropagation()
  event.preventDefault()
}
