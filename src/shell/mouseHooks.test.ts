import { describe, expect, it } from 'vitest'
import { mouseButtonEdgesOf } from './mouseHooks'

const LEFT = 1
const RIGHT = 2

describe('mouse buttons as key codes (ticket 345)', () => {
  it('presses MouseLeft and MouseRight over the canvas and releases them', () => {
    expect(mouseButtonEdgesOf(0, LEFT, true)).toEqual([{ code: 'MouseLeft', isDown: true }])
    expect(mouseButtonEdgesOf(LEFT, 0, true)).toEqual([{ code: 'MouseLeft', isDown: false }])
    expect(mouseButtonEdgesOf(0, RIGHT, true)).toEqual([{ code: 'MouseRight', isDown: true }])
  })

  it('never presses from a click on HUD DOM, but releases there, so nothing sticks', () => {
    expect(mouseButtonEdgesOf(0, LEFT, false)).toEqual([])
    expect(mouseButtonEdgesOf(LEFT, 0, false)).toEqual([{ code: 'MouseLeft', isDown: false }])
  })

  it('reads a second button pressed while the first is held, as a chord makes it', () => {
    expect(mouseButtonEdgesOf(LEFT, LEFT | RIGHT, true)).toEqual([
      { code: 'MouseRight', isDown: true },
    ])
    expect(mouseButtonEdgesOf(LEFT | RIGHT, 0, false)).toEqual([
      { code: 'MouseLeft', isDown: false },
      { code: 'MouseRight', isDown: false },
    ])
  })

  it('gives no edge for a move with the buttons unchanged or a middle button', () => {
    expect(mouseButtonEdgesOf(LEFT, LEFT, true)).toEqual([])
    expect(mouseButtonEdgesOf(0, 4, true)).toEqual([])
  })
})
