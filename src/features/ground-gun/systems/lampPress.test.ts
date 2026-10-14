import { describe, expect, it } from 'vitest'
import { lampFrameAt, pressedLamp, UNTOUCHED_LAMP } from './lampPress'

const LONG_PRESS = 30
const PRESS_TICK = 100

describe('ground-gun: a press on the fire tile lamp', () => {
  it('toggles nothing before the press has lasted the long press', () => {
    expect(lampFrameAt(pressedLamp(PRESS_TICK), PRESS_TICK + 29, LONG_PRESS).isToggleDue).toBe(
      false,
    )
  })

  it('toggles once when the press reaches the long press, and not again while held', () => {
    const frame = lampFrameAt(pressedLamp(PRESS_TICK), PRESS_TICK + 30, LONG_PRESS)
    expect(frame.isToggleDue).toBe(true)
    expect(lampFrameAt(frame.lamp, PRESS_TICK + 90, LONG_PRESS).isToggleDue).toBe(false)
  })

  it('toggles nothing with no finger on the lamp', () => {
    expect(lampFrameAt(UNTOUCHED_LAMP, PRESS_TICK, LONG_PRESS).isToggleDue).toBe(false)
  })
})
