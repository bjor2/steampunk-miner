import { describe, expect, it } from 'vitest'
import { breakDownCutStart, type CutStartTick } from './cutStartBreakdown'

const V_CUT = 1.5

/** `count` ticks alike `tick`. */
function ticksOf(count: number, tick: Partial<CutStartTick>): CutStartTick[] {
  const base = { speed: 0, isDrilling: true, isCutting: true, cutSpeed: V_CUT }
  return Array.from({ length: count }, () => ({ ...base, opensCell: false, ...tick }))
}

/** A slow rig's start: turn, stale facing, first cell, held, second stall, second cell open. */
const SLOW_START = [
  ...ticksOf(8, { isDrilling: false, isCutting: false, cutSpeed: 0 }),
  ...ticksOf(6, { isCutting: false, cutSpeed: 0 }),
  ...ticksOf(26, {}),
  ...ticksOf(1, { opensCell: true }),
  ...ticksOf(27, { speed: V_CUT }),
  ...ticksOf(2, { speed: 0.6 }),
  ...ticksOf(10, {}),
  ...ticksOf(1, { opensCell: true }),
  ...ticksOf(10, { speed: V_CUT }),
]

describe('cut start breakdown (ticket 433)', () => {
  it('splits a start from rest into swivel, stale facing, first cell, held and second stall', () => {
    expect(breakDownCutStart(SLOW_START)).toEqual({
      cutSpeed: V_CUT,
      cellTicks: 40,
      swivelTicks: 8,
      staleFacingTicks: 6,
      firstCellTicks: 26,
      firstCellOpenTick: 40,
      heldTicks: 27,
      secondStallTicks: 11,
      standingTicks: 43,
    })
  })

  it('opens a cell every tick and never stands on a rig whose cell takes under a tick', () => {
    const fast = ticksOf(30, { speed: 15, cutSpeed: 15, opensCell: true })
    expect(breakDownCutStart(fast)).toMatchObject({
      firstCellTicks: 0,
      heldTicks: 1,
      secondStallTicks: 0,
      standingTicks: 0,
    })
  })

  it('has no held span when no second cell opens in the ticks read', () => {
    const once = [...ticksOf(1, { opensCell: true }), ...ticksOf(30, { speed: V_CUT })]
    expect(breakDownCutStart(once)).toMatchObject({ heldTicks: null, secondStallTicks: 0 })
  })

  it('gives nothing for a start whose first cell never opens', () => {
    expect(breakDownCutStart(ticksOf(60, {}))).toBeNull()
  })
})
