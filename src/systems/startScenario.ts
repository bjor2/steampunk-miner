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
 */

export interface StartScenario {
  planetTier?: number
  planetSeed?: number
  /** Fraction of the way from the surface (0) to the core (1). */
  depth?: number
  money?: number
}

export function startScenarioProblems(scenario: StartScenario): string[] {
  return [
    ...planetTierProblems(scenario.planetTier),
    ...planetSeedProblems(scenario.planetSeed),
    ...depthProblems(scenario.depth),
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

function depthProblems(depth: number | undefined): string[] {
  if (depth === undefined) return []
  if (Number.isFinite(depth) && depth >= 0 && depth <= 1) return []
  return [`depth must be a fraction in [0, 1], got ${depth}`]
}

function moneyProblems(money: number | undefined): string[] {
  if (money === undefined) return []
  if (Number.isFinite(money) && money >= 0) return []
  return [`money must be a finite number >= 0, got ${money}`]
}

const KNOWN_KEYS: readonly string[] = ['planetTier', 'planetSeed', 'depth', 'money']

/**
 * Reads a scenario from text (the `?scenario=` launch parameter). Unknown keys and non-number
 * values are problems, not silently dropped; `scenario` is only meaningful when `problems` is empty.
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
    if (!KNOWN_KEYS.includes(key)) return [`unknown scenario field "${key}"`]
    if (typeof value !== 'number') return [`${key} must be a number`]
    return []
  })
}
