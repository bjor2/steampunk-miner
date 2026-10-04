/**
 * Start scenarios: the state a test or bot begins in, written down instead of played for
 * (design doc sections 19-20). Pure and store-free, so a Playwright spec and a vitest spec can
 * both import it.
 *
 * A scenario is refused, never trimmed: every problem is listed, and the caller applies nothing
 * when the list is not empty.
 *
 * This is the start state the store applies; scenario files (`scenario.ts`, #11 section 4) are
 * validated there and mapped onto it. The per-field rules here also guard single debug commands.
 *
 * Money is a decimal string such as "1e30" (decision #5), never a JSON number, so 1e100 and past
 * 1e308 arrive exact.
 */
import { isNonNegativeMoneyText } from './money'

export interface StartScenario {
  planetTier?: number
  planetSeed?: number
  /** Whole tiles below the surface (#11: depth is an integer, never a float fraction). */
  depthTiles?: number
  /** A decimal string >= 0, for example "1e30". */
  money?: string
}

export function startScenarioProblems(scenario: StartScenario): string[] {
  return [
    ...planetTierProblems(scenario.planetTier),
    ...planetSeedProblems(scenario.planetSeed),
    ...depthTilesProblems(scenario.depthTiles),
    ...moneyProblems(scenario.money),
  ]
}

function planetTierProblems(planetTier: number | undefined): string[] {
  if (planetTier === undefined) return []
  if (Number.isInteger(planetTier) && planetTier >= 0) return []
  return [`planetTier must be a whole number >= 0, got ${planetTier}`]
}

function planetSeedProblems(planetSeed: number | undefined): string[] {
  if (planetSeed === undefined) return []
  if (Number.isSafeInteger(planetSeed)) return []
  return [`planetSeed must be a safe integer, got ${planetSeed}`]
}

function depthTilesProblems(depthTiles: number | undefined): string[] {
  if (depthTiles === undefined) return []
  if (Number.isSafeInteger(depthTiles) && depthTiles >= 0) return []
  return [`depthTiles must be a whole number >= 0, got ${depthTiles}`]
}

function moneyProblems(money: string | undefined): string[] {
  if (money === undefined) return []
  if (isNonNegativeMoneyText(money)) return []
  return [`money must be a decimal string >= 0 such as "1e30", got ${JSON.stringify(money)}`]
}
