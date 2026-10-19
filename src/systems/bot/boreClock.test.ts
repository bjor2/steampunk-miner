import { describe, expect, it } from 'vitest'
import { borePlanOf, carriedSubStepsOf } from './boreClock'

const QUANTUM = 60
const CHUNK = 60

const windowSubStepsOf = (plan: ReturnType<typeof borePlanOf>) =>
  plan.chunks.reduce((sum, chunk) => sum + chunk.windowTicks * QUANTUM, 0)
const waitedOf = (plan: ReturnType<typeof borePlanOf>) =>
  plan.chunks.reduce((sum, chunk) => sum + chunk.waitTicks, 0)

describe('bot bore clock (ticket 559)', () => {
  it('waits a 1.5-tick tile one and two ticks in turn, 1.5 on average', () => {
    const tile = { subSteps: 90, quantum: QUANTUM }
    const first = borePlanOf(tile, 0, CHUNK)
    const second = borePlanOf(tile, first.leftSubSteps, CHUNK)
    expect(waitedOf(first)).toBe(2)
    expect(waitedOf(second)).toBe(1)
    expect(second.leftSubSteps).toBe(0)
  })

  it('bores a tenth-of-a-tick tile with no wait while the carry covers it', () => {
    const plan = borePlanOf({ subSteps: 6, quantum: QUANTUM }, 30, CHUNK)
    expect(plan.chunks).toEqual([{ waitTicks: 0, windowTicks: 1 }])
    expect(plan.leftSubSteps).toBe(24)
  })

  it('names windows that always cover the tile, reaching back a tick for a spent carry', () => {
    for (const subSteps of [1, 59, 60, 61, 119, 3601, 7200]) {
      for (const carried of [0, 1, 30, 59]) {
        const plan = borePlanOf({ subSteps, quantum: QUANTUM }, carried, CHUNK)
        expect(windowSubStepsOf(plan)).toBeGreaterThanOrEqual(subSteps)
        expect(plan.leftSubSteps).toBeGreaterThanOrEqual(0)
        expect(plan.leftSubSteps).toBeLessThan(QUANTUM)
        expect(waitedOf(plan) * QUANTUM + carried - plan.leftSubSteps).toBe(subSteps)
      }
    }
  })

  it('splits a long bore into report-sized chunks', () => {
    const plan = borePlanOf({ subSteps: 150 * QUANTUM, quantum: QUANTUM }, 0, CHUNK)
    expect(plan.chunks.map((chunk) => chunk.waitTicks)).toEqual([60, 60, 30])
  })

  it('spends a carry only at the tick it was left, rescaled into the next quantum', () => {
    const carry = { tick: 40, subSteps: 25, quantum: 60 }
    expect(carriedSubStepsOf(carry, 41, 60)).toBe(0)
    expect(carriedSubStepsOf(undefined, 40, 60)).toBe(0)
    expect(carriedSubStepsOf(carry, 40, 120)).toBe(50)
  })
})
