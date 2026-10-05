/**
 * The platform fields of a scenario's start (#8, #10, #11 amendment 1): facilities are registered
 * ids at their one level, and the platform's look follows the core bay (`core_drive` once the bay
 * holds the planet's core), so neither is applied, and a file that contradicts them is refused.
 */
import { coreFragmentsNeeded } from './economy/planetEconomy'
import { FACILITY_IDS } from './registeredIds'
import { isObject, quote, rangeRule, registeredIdRule } from './scenarioFieldRules'
import { coreTileCount } from './world/planetGeometry'
import { planetParamsFor } from './world/planetParams'

/** Each facility is a registered id at its one level (#8, #11 amendment 1). */
export function facilityLevelProblems(value: unknown, path: string): string[] {
  if (!isObject(value)) return [`${path} must be an object of facility id to level`]
  return Object.entries(value).flatMap(([id, level]) => [
    ...registeredIdRule(FACILITY_IDS, 'facility id')(id, `${path} key`),
    ...rangeRule(level, `${path}.${id}`, 1, 1),
  ])
}

/**
 * The platform's look follows the bay: `core_drive` once it holds the planet's core (#8, #10),
 * so a file asking for one look with the other bay is refused rather than half applied.
 */
export function platformStateProblems(
  start: Record<string, unknown>,
  worldSeed: unknown,
): string[] {
  const needed = coreNeededAtStart(start, worldSeed)
  if (needed === null || typeof start.platformState !== 'string') return []
  const fragments = Number.isSafeInteger(start.coreFragments) ? (start.coreFragments as number) : 0
  const isBayFull = fragments >= needed
  if (isBayFull === (start.platformState === 'core_drive')) return []
  return [
    `scenario.start.platformState ${quote(start.platformState)} does not match ` +
      `coreFragments ${fragments} (the core drive shows from ${needed})`,
  ]
}

function coreNeededAtStart(start: Record<string, unknown>, worldSeed: unknown): number | null {
  const planet = start.planet ?? 1
  if (!isUint32(worldSeed) || !Number.isSafeInteger(planet) || (planet as number) < 1) return null
  return coreFragmentsNeeded(coreTileCount(planetParamsFor(worldSeed as number, planet as number)))
}

function isUint32(value: unknown): boolean {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) < 0x100000000
}
