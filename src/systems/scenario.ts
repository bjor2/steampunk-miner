/**
 * Scenario files, `scenarioVersion` 1 (decision #11 section 4): a named start state, a script and
 * expectations, written down instead of played for (design doc sections 19-20).
 *
 *   {"scenarioVersion":1,"name":"planet2-deep-rich","worldSeed":83921,
 *    "start":{"planet":2,"depthTiles":120,"money":"1e30"},
 *    "script":[{"tick":0,"command":"fastForward","args":{"ticks":600}}],
 *    "expect":{"maxDepthTilesAtLeast":300}}
 *
 * Refused, never trimmed: the whole file is validated first, every problem is listed (unknown
 * fields included), and nothing is applied if there is any. Depth is integer (`depthBp` or
 * `depthTiles`), money a decimal string, ids are checked against their registries.
 *
 * Start fields whose system is not built yet (`depthBp` needs the planet radius; inventory,
 * upgrades, unlocks and core fragments need their tickets) are validated, then refused with a
 * problem naming what is missing, so no file is ever half applied.
 */
import { isNonNegativeMoneyText } from './money'
import { UPGRADE_IDS } from './registeredIds'
import type { StartScenario } from './startScenario'

export const SCENARIO_VERSION = 1

/** Basis points of the planet radius: 10000 is the centre. */
const DEPTH_BP_MAX = 10000

export interface Scenario {
  scenarioVersion: typeof SCENARIO_VERSION
  name: string
  worldSeed: number
  start: ScenarioStart
  script?: ScriptStep[]
  expect?: ScenarioExpectations
}

export interface ScenarioStart {
  /** Integer planet index (#4). */
  planet?: number
  depthBp?: number
  depthTiles?: number
  /** A decimal string >= 0, for example "1e30" (#5). */
  money?: string
  inventory?: { tier: number; amount: number }[]
  upgrades?: Record<string, number>
  unlocks?: string[]
  coreFragments?: number
}

/** One scripted step; its `tick` counts from the tick the scenario is applied at. */
export interface ScriptStep {
  tick: number
  command: 'fastForward'
  args: { ticks: number }
}

/** Checks a scenario runner evaluates after the script (#29); validated here, not applied. */
export interface ScenarioExpectations {
  maxDepthTilesAtLeast?: number
}

type FieldRule = (value: unknown, path: string) => string[]

const isPresent = (value: unknown) => value !== undefined

export function validateScenario(value: unknown): string[] {
  if (!isObject(value)) return ['scenario must be a JSON object']
  return [
    ...fieldProblems(value, SCENARIO_FIELDS, 'scenario', [
      'scenarioVersion',
      'name',
      'worldSeed',
      'start',
    ]),
    ...(isObject(value.start) ? startCombinationProblems(value.start) : []),
    ...(Array.isArray(value.script) ? scriptOrderProblems(value.script) : []),
  ]
}

export function isValidScenario(value: unknown): value is Scenario {
  return validateScenario(value).length === 0
}

/** Reads a scenario from text (the `?scenario=` launch parameter or `--scenario=<path>`). */
export function parseScenario(text: string): { scenario: unknown; problems: string[] } {
  try {
    const scenario: unknown = JSON.parse(text)
    return { scenario, problems: validateScenario(scenario) }
  } catch {
    return { scenario: null, problems: ['scenario is not valid JSON'] }
  }
}

function fieldProblems(
  value: Record<string, unknown>,
  rules: Readonly<Record<string, FieldRule>>,
  path: string,
  required: readonly string[] = [],
): string[] {
  return [
    ...Object.keys(value)
      .filter((name) => !Object.hasOwn(rules, name))
      .map((name) => `${path}.${name} is not a scenario field`),
    ...required
      .filter((name) => !isPresent(value[name]))
      .map((name) => `${path}.${name} is required`),
    ...Object.entries(rules)
      .filter(([name]) => isPresent(value[name]))
      .flatMap(([name, rule]) => rule(value[name], `${path}.${name}`)),
  ]
}

const SCENARIO_FIELDS: Readonly<Record<string, FieldRule>> = {
  scenarioVersion: (value, path) =>
    value === SCENARIO_VERSION ? [] : [`${path} must be ${SCENARIO_VERSION}, got ${quote(value)}`],
  name: (value, path) => (isNonEmptyText(value) ? [] : [`${path} must be a non-empty string`]),
  worldSeed: safeIntegerRule,
  start: (value, path) => objectRule(value, path, START_FIELDS),
  script: (value, path) => listRule(value, path, scriptStepProblems),
  expect: (value, path) => objectRule(value, path, EXPECT_FIELDS),
}

const START_FIELDS: Readonly<Record<string, FieldRule>> = {
  planet: wholeNumberRule,
  depthBp: (value, path) => [
    ...rangeRule(value, path, 0, DEPTH_BP_MAX),
    notBuiltYet(path, 'the planet radius from the generator (Build 2)'),
  ],
  depthTiles: wholeNumberRule,
  money: (value, path) =>
    isNonNegativeMoneyText(value)
      ? []
      : [`${path} must be a decimal string >= 0 such as "1e30", got ${quote(value)}`],
  inventory: (value, path) => [
    ...listRule(value, path, (item, itemPath) => objectRule(item, itemPath, INVENTORY_FIELDS)),
    ...notBuiltYetUnlessEmpty(value, path, 'cargo (Build 4)'),
  ],
  upgrades: (value, path) => [
    ...upgradeLevelProblems(value, path),
    ...notBuiltYetUnlessEmpty(value, path, 'the upgrade loop (Build 6)'),
  ],
  unlocks: (value, path) => [
    ...listRule(value, path, unlockIdProblems),
    ...notBuiltYetUnlessEmpty(value, path, 'unlocks (Build 7)'),
  ],
  coreFragments: (value, path) => [
    ...wholeNumberRule(value, path),
    ...(value === 0 ? [] : [notBuiltYet(path, 'the core bay (Build 7)')]),
  ],
}

const INVENTORY_FIELDS: Readonly<Record<string, FieldRule>> = {
  tier: (value, path) => rangeRule(value, path, 1, Number.MAX_SAFE_INTEGER),
  amount: wholeNumberRule,
}

const EXPECT_FIELDS: Readonly<Record<string, FieldRule>> = {
  maxDepthTilesAtLeast: wholeNumberRule,
}

const SCRIPT_STEP_FIELDS: Readonly<Record<string, FieldRule>> = {
  tick: wholeNumberRule,
  command: (value, path) =>
    value === 'fastForward' ? [] : [`${path} must be one of fastForward, got ${quote(value)}`],
  args: (value, path) => objectRule(value, path, FAST_FORWARD_ARGS, ['ticks']),
}

const FAST_FORWARD_ARGS: Readonly<Record<string, FieldRule>> = { ticks: wholeNumberRule }

function scriptStepProblems(step: unknown, path: string): string[] {
  return objectRule(step, path, SCRIPT_STEP_FIELDS, ['tick', 'command', 'args'])
}

function startCombinationProblems(start: Record<string, unknown>): string[] {
  if (isPresent(start.depthBp) && isPresent(start.depthTiles)) {
    return ['scenario.start has both depthBp and depthTiles; give one']
  }
  return []
}

/** Steps run in file order, so their ticks may not go backwards. */
function scriptOrderProblems(script: unknown[]): string[] {
  const ticks = script.map((step) => (isObject(step) ? step.tick : undefined))
  return ticks.flatMap((tick, index) =>
    index > 0 && isBefore(tick, ticks[index - 1])
      ? [`scenario.script[${index}].tick is before the step above it`]
      : [],
  )
}

function isBefore(tick: unknown, previous: unknown): boolean {
  return typeof tick === 'number' && typeof previous === 'number' && tick < previous
}

function upgradeLevelProblems(value: unknown, path: string): string[] {
  if (!isObject(value)) return [`${path} must be an object of upgrade id to level`]
  return Object.entries(value).flatMap(([id, level]) => [
    ...(UPGRADE_IDS.includes(id) ? [] : [`${path}.${id} is not a registered upgrade id`]),
    ...wholeNumberRule(level, `${path}.${id}`),
  ])
}

/** No unlock ids are registered yet; the ticket that defines unlocks registers them. */
function unlockIdProblems(value: unknown, path: string): string[] {
  return [`${path} ${quote(value)} is not a registered unlock id`]
}

function objectRule(
  value: unknown,
  path: string,
  rules: Readonly<Record<string, FieldRule>>,
  required: readonly string[] = [],
): string[] {
  if (!isObject(value)) return [`${path} must be an object`]
  return fieldProblems(value, rules, path, required)
}

function listRule(value: unknown, path: string, itemRule: FieldRule): string[] {
  if (!Array.isArray(value)) return [`${path} must be a list`]
  return value.flatMap((item, index) => itemRule(item, `${path}[${index}]`))
}

function wholeNumberRule(value: unknown, path: string): string[] {
  return rangeRule(value, path, 0, Number.MAX_SAFE_INTEGER)
}

function safeIntegerRule(value: unknown, path: string): string[] {
  return Number.isSafeInteger(value) ? [] : [`${path} must be a safe integer, got ${quote(value)}`]
}

function rangeRule(value: unknown, path: string, min: number, max: number): string[] {
  if (Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max) return []
  return [`${path} must be a whole number from ${min} to ${max}, got ${quote(value)}`]
}

function notBuiltYetUnlessEmpty(value: unknown, path: string, missing: string): string[] {
  return isEmptyCollection(value) ? [] : [notBuiltYet(path, missing)]
}

function notBuiltYet(path: string, missing: string): string {
  return `${path} cannot be applied until ${missing} exists`
}

function isEmptyCollection(value: unknown): boolean {
  if (Array.isArray(value)) return value.length === 0
  return isObject(value) && Object.keys(value).length === 0
}

function isNonEmptyText(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function quote(value: unknown): string {
  return JSON.stringify(value) ?? 'nothing'
}

/**
 * The start state a valid scenario applies. The world seed is the planet seed until the planet
 * generator (Build 2) derives each planet's seed from it.
 */
export function startOfScenario(scenario: Scenario): StartScenario {
  const { planet, depthTiles, money } = scenario.start
  return {
    ...(planet === undefined ? {} : { planetTier: planet }),
    planetSeed: scenario.worldSeed,
    ...(depthTiles === undefined ? {} : { depthTiles }),
    ...(money === undefined ? {} : { money }),
  }
}
