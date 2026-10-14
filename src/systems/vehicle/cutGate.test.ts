import { describe, expect, it } from 'vitest'
import { CUT_GATE_HOLD_TICKS } from '../../constants/balance'
import { createSeededRandom } from '../seededRandom'
import { CLOSED_CUT_GATE, idledCutGate, isCutGateOpen, nextCutGate, type CutGate } from './cutGate'

/** The gate after each tick of `uncutBps`, from closed. */
function gatesAlong(uncutBps: readonly number[], from: CutGate = CLOSED_CUT_GATE): CutGate[] {
  const gates: CutGate[] = []
  let gate = from
  for (const uncutBp of uncutBps) {
    gate = nextCutGate(gate, uncutBp)
    gates.push(gate)
  }
  return gates
}

/** Runs of 1 to 12 ticks of cave (under 25% uncut) and rock (over 50%), in seeded order. */
function mixedLineOf(seed: number, ticks: number): number[] {
  const random = createSeededRandom(seed)
  const line: number[] = []
  while (line.length < ticks) {
    const isRock = random.nextInt(2) === 1
    const run = 1 + random.nextInt(12)
    for (let tick = 0; tick < run; tick++) {
      line.push(isRock ? 5000 + random.nextInt(5001) : random.nextInt(2500))
    }
  }
  return line
}

const openTicks = (gates: readonly CutGate[]) => gates.map((gate) => (isCutGateOpen(gate) ? 1 : 0))

describe('cut gate (ticket 333)', () => {
  it('opens on the first tick of fresh ground', () => {
    expect(isCutGateOpen(nextCutGate(CLOSED_CUT_GATE, 10000))).toBe(true)
    expect(isCutGateOpen(nextCutGate(CLOSED_CUT_GATE, 5000))).toBe(true)
  })

  it('stays closed on half-cut ground and below', () => {
    expect(openTicks(gatesAlong([4999, 2500, 0]))).toEqual([0, 0, 0])
  })

  it('closes after six consecutive ticks under the off line, not before', () => {
    const gates = gatesAlong([10000, 2499, 2499, 2499, 2499, 2499, 2499])
    expect(openTicks(gates)).toEqual([1, 1, 1, 1, 1, 1, 0])
  })

  it('stays open while the slab stays at the off line or above', () => {
    const gates = gatesAlong([10000, 2499, 2499, 2500, 2499, 2499, 2499, 2499, 2499, 2499])
    expect(openTicks(gates)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 0])
  })

  it('does not open again within six ticks of closing', () => {
    const lows = Array.from({ length: CUT_GATE_HOLD_TICKS }, () => 0)
    const gates = gatesAlong([10000, ...lows, 10000, 10000, 10000, 10000, 10000, 10000])
    expect(openTicks(gates)).toEqual([1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1])
  })

  it('flips at most once in any six ticks along a mixed cave and rock line', () => {
    const open = openTicks(gatesAlong(mixedLineOf(333, 3000)))
    const flips = open.flatMap((value, tick) =>
      tick > 0 && value !== open[tick - 1] ? [tick] : [],
    )
    const gaps = flips.slice(1).map((tick, index) => tick - flips[index])
    expect(flips.length).toBeGreaterThan(10)
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(CUT_GATE_HOLD_TICKS)
  })

  it('counts ticks with no drill step as ticks under the off line', () => {
    const open = nextCutGate(CLOSED_CUT_GATE, 10000)
    expect(isCutGateOpen(idledCutGate(open, CUT_GATE_HOLD_TICKS - 1))).toBe(true)
    expect(isCutGateOpen(idledCutGate(open, CUT_GATE_HOLD_TICKS))).toBe(false)
    const idled = idledCutGate(open, 3)
    expect(idledCutGate(idled, 2)).toEqual(idledCutGate(open, 5))
  })

  it('may open after a long pause as soon as fresh ground meets the slab', () => {
    const open = nextCutGate(CLOSED_CUT_GATE, 10000)
    const paused = idledCutGate(open, 100)
    expect(isCutGateOpen(nextCutGate(paused, 10000))).toBe(true)
  })
})
