import { describe, expect, it } from 'vitest'
import { COLLAPSE_WARN_TICKS } from '../../constants/balance'
import { CASING_BLINK_HALF_PERIOD_TICKS, CASING_BLINK_STILL_SHARE } from '../../constants/scene'
import type { CollapseState } from '../authority/collapse/collapseState'
import { blinkShareAtTile, blinkShareOf, blinkStartTick } from './casingBlink'
import { createTelegraphSlots, writeTelegraphBlocks } from './collapseTelegraph'

// CG2 (ticket 830): the lining of a block warning of collapse blinks red for the last 3 s of its
// hold, or the whole hold when shorter, on the authority's ticks; steady red with reduce motion.

const HALF = CASING_BLINK_HALF_PERIOD_TICKS
/** #43's 1 s hold, which every block but a burst warns for. */
const HOLD = COLLAPSE_WARN_TICKS

describe('casing blink (ticket 830)', () => {
  it('blinks the whole of a hold shorter than 3 s, from its first tick', () => {
    expect(blinkStartTick()).toBe(0)
    expect(blinkShareOf(0, HOLD, false)).toBe(1)
  })

  it('squares between red and the plate a half period at a time', () => {
    const shares = Array.from({ length: 4 * HALF }, (_, tick) => blinkShareOf(tick, HOLD, false))
    expect(shares.slice(0, HALF).every((share) => share === 1)).toBe(true)
    expect(shares.slice(HALF, 2 * HALF).every((share) => share === 0)).toBe(true)
    expect(shares.slice(2 * HALF, 3 * HALF).every((share) => share === 1)).toBe(true)
  })

  it('holds a steady share of red with reduce motion, never blinking', () => {
    const shares = Array.from({ length: COLLAPSE_WARN_TICKS }, (_, tick) =>
      blinkShareOf(tick, HOLD, true),
    )
    expect(new Set(shares)).toEqual(new Set([CASING_BLINK_STILL_SHARE]))
  })

  it('holds full red through the refill after the warning, motion reduced or not', () => {
    expect(blinkShareOf(COLLAPSE_WARN_TICKS, HOLD, false)).toBe(1)
    expect(blinkShareOf(COLLAPSE_WARN_TICKS + 17, HOLD, true)).toBe(1)
  })

  it('shows nothing before the blink starts', () => {
    expect(blinkShareOf(-1, HOLD, false)).toBe(0)
  })

  it('reads the red over a tile from the telegraph blocks holding it, and 0 elsewhere', () => {
    const collapse: CollapseState = {
      blocks: [{ block: '0,8#17', startTick: 100, isForced: false }],
    }
    const slots = createTelegraphSlots(4)
    const count = writeTelegraphBlocks(slots, collapse, 100 + 2 * HALF)
    expect(slots[0]).toMatchObject({ x0: 4, y0: 264, elapsedTicks: 2 * HALF })
    expect(blinkShareAtTile(slots, count, 5, 265, false)).toBe(1)
    expect(blinkShareAtTile(slots, count, 5, 265, true)).toBe(CASING_BLINK_STILL_SHARE)
    expect(blinkShareAtTile(slots, count, 9, 265, false)).toBe(0)
  })

  // Ticket 829: a burst holds up to 20 s and blinks only its last 3 s.
  it('blinks only the last 3 s of a burst that holds 20 s, then holds red through the refill', () => {
    const twentySeconds = 1200
    expect(blinkStartTick(twentySeconds)).toBe(1020)
    expect(blinkShareOf(1019, twentySeconds, false)).toBe(0)
    expect(blinkShareOf(1020, twentySeconds, false)).toBe(1)
    expect(blinkShareOf(1020 + HALF, twentySeconds, false)).toBe(0)
    expect(blinkShareOf(twentySeconds, twentySeconds, true)).toBe(1)
  })

  it("reads a burst's blink from its own hold in the telegraph slots", () => {
    const collapse: CollapseState = {
      blocks: [{ block: '0,8#17', startTick: 100, isForced: false, holdTicks: 600 }],
    }
    const slots = createTelegraphSlots(1)
    const count = writeTelegraphBlocks(slots, collapse, 100 + 300)
    expect(slots[0]).toMatchObject({ holdTicks: 600, progress: 0.5 })
    expect(blinkShareAtTile(slots, count, 5, 265, false)).toBe(0)
  })
})
