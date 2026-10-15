/**
 * When the brass tooltip is open (spec #422 ruling 4, build #423): a mouse resting on its element
 * for `TOOLTIP_HOVER_MS`, the keyboard's focus at once, or a touch held `TOOLTIP_LONG_PRESS_MS`,
 * open while held and firing no action when it lifts (Gameplay & Vehicle's input rules on #164).
 * Pure: time arrives as milliseconds, so the hook schedules its one timer from `tooltipOpensAtMs`.
 */
import { TOOLTIP_HOVER_MS, TOOLTIP_LONG_PRESS_MS } from '../../constants/uiParts'

export interface TooltipOpening {
  /** When the mouse came to rest on the element; null while it is away. */
  readonly hoverSinceMs: number | null
  /** When a touch or pen pressed the element; null while nothing presses it. */
  readonly pressSinceMs: number | null
  readonly isFocused: boolean
}

export type TooltipPointer = 'mouse' | 'touch' | 'pen'

export const TOOLTIP_CLOSED: TooltipOpening = {
  hoverSinceMs: null,
  pressSinceMs: null,
  isFocused: false,
}

export function withHoverSince(opening: TooltipOpening, atMs: number): TooltipOpening {
  return { ...opening, hoverSinceMs: atMs }
}

export function withoutHover(opening: TooltipOpening): TooltipOpening {
  return { ...opening, hoverSinceMs: null }
}

export function withFocus(opening: TooltipOpening): TooltipOpening {
  return { ...opening, isFocused: true }
}

export function withoutFocus(opening: TooltipOpening): TooltipOpening {
  return { ...opening, isFocused: false }
}

/** A finger or pen starts a hold; a mouse button never does, its click must act at once. */
export function withPressSince(
  opening: TooltipOpening,
  pointer: TooltipPointer,
  atMs: number,
): TooltipOpening {
  if (pointer === 'mouse') return opening
  return { ...opening, pressSinceMs: atMs }
}

export function withoutPress(opening: TooltipOpening): TooltipOpening {
  return { ...opening, pressSinceMs: null }
}

export function isTooltipOpenAt(opening: TooltipOpening, nowMs: number): boolean {
  return opening.isFocused || isHoverRipeAt(opening, nowMs) || isPressRipeAt(opening, nowMs)
}

/** The press that lifts now ended a hold that opened the tooltip, so its click fires no action. */
export function doesPressEndSwallowClick(opening: TooltipOpening, nowMs: number): boolean {
  return isPressRipeAt(opening, nowMs)
}

/**
 * The earliest moment a pending hover or hold opens the tooltip; null when nothing is pending
 * or it is open already. The hook sets one timer for it and asks `isTooltipOpenAt` then.
 */
export function tooltipOpensAtMs(opening: TooltipOpening, nowMs: number): number | null {
  if (isTooltipOpenAt(opening, nowMs)) return null
  const pending = [
    opening.hoverSinceMs === null ? null : opening.hoverSinceMs + TOOLTIP_HOVER_MS,
    opening.pressSinceMs === null ? null : opening.pressSinceMs + TOOLTIP_LONG_PRESS_MS,
  ].filter((atMs): atMs is number => atMs !== null)
  return pending.length === 0 ? null : Math.min(...pending)
}

function isHoverRipeAt(opening: TooltipOpening, nowMs: number): boolean {
  return opening.hoverSinceMs !== null && nowMs - opening.hoverSinceMs >= TOOLTIP_HOVER_MS
}

function isPressRipeAt(opening: TooltipOpening, nowMs: number): boolean {
  return opening.pressSinceMs !== null && nowMs - opening.pressSinceMs >= TOOLTIP_LONG_PRESS_MS
}
