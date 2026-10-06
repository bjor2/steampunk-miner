import { describe, expect, it } from 'vitest'
import { createBudgetBreachWatch, takeBudgetBreachStart } from './budgetBreach'

const BUDGET_MS = 16.7

/** Feeds one p95 per second and returns which seconds were due a screenshot. */
function shotsOver(frameMsP95PerSecond: number[]): boolean[] {
  const watch = createBudgetBreachWatch(BUDGET_MS)
  return frameMsP95PerSecond.map((p95) => takeBudgetBreachStart(watch, p95))
}

describe('budget breach screenshot', () => {
  it('is due nothing while every second is within the budget', () => {
    expect(shotsOver([8, 12, 16.7])).toEqual([false, false, false])
  })

  it('is due on the first second over the budget', () => {
    expect(shotsOver([12, 17])).toEqual([false, true])
  })

  it('is due once for a breach that lasts several seconds', () => {
    expect(shotsOver([20, 400, 1200, 30])).toEqual([true, false, false, false])
  })

  it('is due again for a new breach after a second back within the budget', () => {
    expect(shotsOver([20, 25, 14, 22])).toEqual([true, false, false, true])
  })
})
