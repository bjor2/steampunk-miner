import { describe, expect, it } from 'vitest'
import { TOOLTIP_HOVER_MS, TOOLTIP_LONG_PRESS_MS } from '../../constants/uiParts'
import {
  doesPressEndSwallowClick,
  isTooltipOpenAt,
  TOOLTIP_CLOSED,
  tooltipOpensAtMs,
  withFocus,
  withHoverSince,
  withoutFocus,
  withoutHover,
  withoutPress,
  withPressSince,
  type TooltipOpening,
} from './tooltipOpening'

// Spec #422 ruling 4 (build #423): the brass tooltip's opening rule with time as an argument.

/** Polls the rule every `stepMs` from 0 and returns the first time it answers open. */
function firstOpenMs(opening: TooltipOpening, stepMs: number, untilMs: number): number | null {
  for (let nowMs = 0; nowMs <= untilMs; nowMs += stepMs) {
    if (isTooltipOpenAt(opening, nowMs)) return nowMs
  }
  return null
}

describe('tooltip opening', () => {
  it('starts closed with nothing pending', () => {
    expect(isTooltipOpenAt(TOOLTIP_CLOSED, 0)).toBe(false)
    expect(tooltipOpensAtMs(TOOLTIP_CLOSED, 0)).toBeNull()
  })

  it('opens about 200 ms after the mouse comes to rest, not a millisecond before', () => {
    const hovered = withHoverSince(TOOLTIP_CLOSED, 1000)
    expect(isTooltipOpenAt(hovered, 1000 + TOOLTIP_HOVER_MS - 1)).toBe(false)
    expect(isTooltipOpenAt(hovered, 1000 + TOOLTIP_HOVER_MS)).toBe(true)
    expect(tooltipOpensAtMs(hovered, 1000)).toBe(1000 + TOOLTIP_HOVER_MS)
  })

  it('closes as soon as the mouse leaves, however long it rested', () => {
    const left = withoutHover(withHoverSince(TOOLTIP_CLOSED, 0))
    expect(isTooltipOpenAt(left, 5000)).toBe(false)
  })

  it('opens at once on keyboard focus and closes on blur', () => {
    const focused = withFocus(TOOLTIP_CLOSED)
    expect(isTooltipOpenAt(focused, 0)).toBe(true)
    expect(tooltipOpensAtMs(focused, 0)).toBeNull()
    expect(isTooltipOpenAt(withoutFocus(focused), 0)).toBe(false)
  })

  it('opens on a touch held 400 ms and stays open while the touch holds', () => {
    const pressed = withPressSince(TOOLTIP_CLOSED, 'touch', 0)
    expect(isTooltipOpenAt(pressed, TOOLTIP_LONG_PRESS_MS - 1)).toBe(false)
    expect(isTooltipOpenAt(pressed, TOOLTIP_LONG_PRESS_MS)).toBe(true)
    expect(isTooltipOpenAt(pressed, TOOLTIP_LONG_PRESS_MS * 10)).toBe(true)
    expect(tooltipOpensAtMs(pressed, 0)).toBe(TOOLTIP_LONG_PRESS_MS)
  })

  it('swallows the click of a touch that lifts after the hold opened it, and no other', () => {
    const pressed = withPressSince(TOOLTIP_CLOSED, 'pen', 0)
    expect(doesPressEndSwallowClick(pressed, TOOLTIP_LONG_PRESS_MS)).toBe(true)
    expect(doesPressEndSwallowClick(pressed, TOOLTIP_LONG_PRESS_MS - 1)).toBe(false)
    expect(isTooltipOpenAt(withoutPress(pressed), TOOLTIP_LONG_PRESS_MS)).toBe(false)
  })

  it('never starts a hold from a mouse button, so a click acts at once', () => {
    const clicked = withPressSince(TOOLTIP_CLOSED, 'mouse', 0)
    expect(clicked).toBe(TOOLTIP_CLOSED)
    expect(isTooltipOpenAt(clicked, TOOLTIP_LONG_PRESS_MS * 2)).toBe(false)
  })

  it('names the earliest pending opening when a hover and a hold overlap', () => {
    const both = withPressSince(withHoverSince(TOOLTIP_CLOSED, 300), 'touch', 0)
    expect(tooltipOpensAtMs(both, 300)).toBe(
      Math.min(300 + TOOLTIP_HOVER_MS, TOOLTIP_LONG_PRESS_MS),
    )
  })

  it('opens at the same moment whether polled every 16 ms or every 33 ms', () => {
    const hovered = withHoverSince(TOOLTIP_CLOSED, 0)
    const at16 = firstOpenMs(hovered, 16, 1000)!
    const at33 = firstOpenMs(hovered, 33, 1000)!
    expect(at16).toBeGreaterThanOrEqual(TOOLTIP_HOVER_MS)
    expect(at33).toBeGreaterThanOrEqual(TOOLTIP_HOVER_MS)
    expect(Math.abs(at16 - at33)).toBeLessThan(33)
  })
})
