/**
 * Start scenarios: the state a test or bot begins in, written down instead of played for
 * (design doc sections 19-20). Pure and store-free, so a Playwright spec and a vitest spec can
 * both import it.
 *
 * A scenario is refused, never trimmed: every problem is listed, and the caller applies nothing
 * when the list is not empty.
 *
 * Only the fields below exist so far; the design lists many more (upgrades, wagons, facilities,
 * NPC states, quests, enemies, core status, party size...). Add each with its rule and its test.
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

const FIELD_TYPES: Readonly<Record<keyof StartScenario, 'number' | 'string'>> = {
  planetTier: 'number',
  planetSeed: 'number',
  depthTiles: 'number',
  money: 'string',
}

const FIELD_TYPE_NAMES = { number: 'a number', string: 'a decimal string' } as const

/**
 * Reads a scenario from text (the `?scenario=` launch parameter). Unknown keys and values of the
 * wrong JSON type are problems, not silently dropped; `scenario` is only meaningful when `problems` is empty.
 */
export function parseStartScenario(text: string): {
  scenario: StartScenario
  problems: string[]
} {
  const parsed = readJsonObject(text)
  if (typeof parsed === 'string') return { scenario: {}, problems: [parsed] }
  const scenario = parsed as StartScenario
  return { scenario, problems: [...shapeProblems(parsed), ...startScenarioProblems(scenario)] }
}

function readJsonObject(text: string): Record<string, unknown> | string {
  try {
    const value: unknown = JSON.parse(text)
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return value as Record<string, unknown>
    }
    return 'scenario must be a JSON object'
  } catch {
    return 'scenario is not valid JSON'
  }
}

function shapeProblems(fields: Record<string, unknown>): string[] {
  return Object.entries(fields).flatMap(([key, value]) => {
    if (!Object.hasOwn(FIELD_TYPES, key)) return [`unknown scenario field "${key}"`]
    const expected = FIELD_TYPES[key as keyof StartScenario]
    if (typeof value !== expected) return [`${key} must be ${FIELD_TYPE_NAMES[expected]}`]
    return []
  })
}
