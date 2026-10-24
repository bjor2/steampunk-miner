/**
 * The completed-core revisit bar of ticket 801 (the #790 follow-up; the #756 back-travel bar, VS):
 * a planet whose core the session already harvested, gone back to and re-mined, must earn less
 * money a minute than the frontier planet after it, on the median of the pacing seeds (#84). Its
 * core tiles grow back on entry (world deltas reset), but they drop fragments into a bay that
 * completed already (ticket 790): no sale value, no second `core_completed`. The bar stops that
 * from becoming a farm.
 *
 * A miss goes to Systems and the VS as a bay-cap or fragment-value row, never to a bot retune.
 */
import { cmp, toFixedText, type Money } from '../systems/money'

/** One seed's money per minute re-mining `planet`'s completed core, and on the frontier after it. */
export interface CoreRevisitRun {
  worldSeed: number
  planet: number
  revisitRate: Money | null
  frontierRate: Money | null
}

/** The bar as problems; empty when every planet's revisit earns under its frontier. */
export function gatedCoreRevisitProblemsOf(revisits: readonly CoreRevisitRun[]): string[] {
  return revisitPlanetsOf(revisits).flatMap((planet) => revisitProblems(revisits, planet))
}

/** The lines the lane prints and never gates. */
export function printedCoreRevisitLinesOf(revisits: readonly CoreRevisitRun[]): string[] {
  return revisitPlanetsOf(revisits).map((planet) => revisitLine(revisits, planet))
}

function revisitPlanetsOf(revisits: readonly CoreRevisitRun[]): number[] {
  return [...new Set(revisits.map((run) => run.planet))].sort((a, b) => a - b)
}

/** A rate never measured is a problem too: the bar holds only on numbers. */
function revisitProblems(revisits: readonly CoreRevisitRun[], planet: number): string[] {
  const { revisit, frontier } = medianRatesOf(revisits, planet)
  if (revisit === null || frontier === null) {
    return [`planet ${planet}'s completed-core revisit was not measured against its frontier`]
  }
  if (cmp(revisit, frontier) < 0) return []
  return [
    `re-mining planet ${planet}'s completed core earns ${toFixedText(revisit, 1)} a minute, ` +
      `not under the frontier's ${toFixedText(frontier, 1)} on planet ${planet + 1}`,
  ]
}

function revisitLine(revisits: readonly CoreRevisitRun[], planet: number): string {
  const { revisit, frontier } = medianRatesOf(revisits, planet)
  return (
    `re-mining planet ${planet}'s completed core: ${rateText(revisit)} a minute, ` +
    `frontier planet ${planet + 1}: ${rateText(frontier)}`
  )
}

function medianRatesOf(
  revisits: readonly CoreRevisitRun[],
  planet: number,
): { revisit: Money | null; frontier: Money | null } {
  const seeds = revisits.filter((run) => run.planet === planet)
  return {
    revisit: medianMoneyOf(seeds.map((run) => run.revisitRate)),
    frontier: medianMoneyOf(seeds.map((run) => run.frontierRate)),
  }
}

function rateText(rate: Money | null): string {
  return rate === null ? 'never' : toFixedText(rate, 1)
}

/** The middle value, a null (never measured) sorting after every amount. */
function medianMoneyOf(values: readonly (Money | null)[]): Money | null {
  const sorted = [...values].sort(compareMoneyNullLast)
  return sorted[Math.floor(sorted.length / 2)] ?? null
}

function compareMoneyNullLast(a: Money | null, b: Money | null): number {
  if (a === null || b === null) return (a === null ? 1 : 0) - (b === null ? 1 : 0)
  return cmp(a, b)
}
