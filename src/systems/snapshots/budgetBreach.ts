/**
 * When a debug run takes a screenshot for a frame budget breach (#123, logging strategy section
 * 1: "on budget breach"). A breach is a second of frames whose p95 is over the budget (#38); a
 * screenshot is due on the first second of each breach, never on the seconds that continue it,
 * so a run that stays over budget (software GL, a loaded box) gives one shot, not one a second.
 * Mutated in place.
 */

export interface BudgetBreachWatch {
  readonly budgetMs: number
  isBreaching: boolean
}

export function createBudgetBreachWatch(budgetMs: number): BudgetBreachWatch {
  return { budgetMs, isBreaching: false }
}

/** True on the second a breach begins; false while it continues and while frames are in budget. */
export function takeBudgetBreachStart(watch: BudgetBreachWatch, frameMsP95: number): boolean {
  const wasBreaching = watch.isBreaching
  watch.isBreaching = frameMsP95 > watch.budgetMs
  return watch.isBreaching && !wasBreaching
}
