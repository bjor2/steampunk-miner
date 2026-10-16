import { describe, expect, it } from 'vitest'
import { FRAME_BUDGET_MS } from '../../constants/scene'
import { closeDrawInterval, createRenderRate, frameBudgetMsOf, isFrameDue } from './renderRate'

/** How many of `frames` display frames at `refreshHz` draw under `fpsCap`. */
function framesDrawn(fpsCap: number | null, refreshHz: number, frames: number): number {
  const rate = createRenderRate()
  let drawn = 0
  for (let frame = 0; frame < frames; frame++) {
    if (!isFrameDue(rate, fpsCap, 1 / refreshHz)) continue
    closeDrawInterval(rate)
    drawn++
  }
  return drawn
}

describe('render rate cap (TD #470 section 2.4 step 2, ticket 477)', () => {
  it('draws every second refresh of a 60 Hz display at a 30 fps cap', () => {
    expect(framesDrawn(30, 60, 600)).toBe(300)
  })

  it('draws 30 frames a second on a 120 Hz display too', () => {
    expect(framesDrawn(30, 120, 1200)).toBe(300)
  })

  it('draws every frame of a display already at or under the cap', () => {
    expect(framesDrawn(30, 30, 300)).toBe(300)
  })

  it('draws every frame with no cap', () => {
    expect(framesDrawn(null, 144, 144)).toBe(144)
  })

  it('hands the frame window the whole interval the drawn frame closes', () => {
    const rate = createRenderRate()
    isFrameDue(rate, 30, 1 / 60)
    isFrameDue(rate, 30, 1 / 60)
    expect(closeDrawInterval(rate)).toBeCloseTo(1 / 30, 9)
    expect(rate.sinceDrawSeconds).toBe(0)
  })

  it('judges a capped rate against its own frame, never a tighter one', () => {
    expect(frameBudgetMsOf(null, FRAME_BUDGET_MS)).toBe(FRAME_BUDGET_MS)
    expect(frameBudgetMsOf(30, FRAME_BUDGET_MS)).toBeCloseTo(33.33, 2)
    expect(frameBudgetMsOf(120, FRAME_BUDGET_MS)).toBe(FRAME_BUDGET_MS)
  })
})
