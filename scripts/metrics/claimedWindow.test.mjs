import { describe, expect, it } from 'vitest'
import { claimedWindowTotals } from './claimedWindow.mjs'
import { CATEGORY_IDS } from './phaseCategories.mjs'

const T0 = Date.parse('2026-10-06T10:00:00.000Z')
function iso(minutes) {
  return new Date(T0 + minutes * 60_000).toISOString()
}
function segment(category, fromMin, toMin) {
  return { category, start: iso(fromMin), end: iso(toMin), attempt: 0, source: 'github' }
}

// Created at 0, blocked 0-30, idle 30-40, claimed at 40: context 40-50, needs-planner 50-70,
// developing 70-90, idle on a gate slot 90-95, gates 95-100, closed at 100.
const SEGMENTS = [
  segment('blocked', 0, 30),
  segment('idle', 30, 40),
  segment('context', 40, 50),
  segment('planner_wait', 50, 70),
  segment('developing', 70, 90),
  segment('idle', 90, 95),
  segment('gates', 95, 100),
]

describe('claimed-to-done window', () => {
  it('drops a block from before the claim', () => {
    const totals = claimedWindowTotals(SEGMENTS, iso(40), iso(100))
    expect(totals.blocked).toBe(0)
  })

  it('keeps a planner wait inside the window as planner_wait', () => {
    const totals = claimedWindowTotals(SEGMENTS, iso(40), iso(100))
    expect(totals.planner_wait).toBe(20 * 60)
  })

  it('keeps idle inside the window and drops idle before the claim', () => {
    const totals = claimedWindowTotals(SEGMENTS, iso(40), iso(100))
    expect(totals.idle).toBe(5 * 60)
  })

  it('adds up to the claimed-to-done time with every category present', () => {
    const totals = claimedWindowTotals(SEGMENTS, iso(40), iso(100))
    expect(Object.keys(totals)).toEqual(CATEGORY_IDS)
    expect(Object.values(totals).reduce((a, b) => a + b, 0)).toBe(60 * 60)
  })

  it('keeps only the part after the claim of a segment that straddles it', () => {
    const totals = claimedWindowTotals([segment('blocked', 0, 50)], iso(40), iso(100))
    expect(totals.blocked).toBe(10 * 60)
  })
})
