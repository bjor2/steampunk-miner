/**
 * `computeVehicleStats(levels, defs)` (decision #7 "Upgrades as data", #21 acceptance 1 to 3): the
 * vehicle's stats as a pure function of its six integer upgrade levels (steps since #180). The save and the authority
 * hold the levels only, so restoring them recomputes the stats and a changed coefficient in the
 * definitions retunes an old save. Levels arrive from commands and scenarios, so they are checked
 * first: a level that is not a safe integer >= 0 is refused with a listed problem.
 */
import { ECONOMY } from '../economy/economy'
import { UPGRADE_IDS, type UpgradeId } from '../economy/economyDefinition'
import {
  vehicleStatsAt,
  type UpgradeDefs,
  type UpgradeLevels,
  type VehicleStats,
} from '../economy/vehicleStats'

export type VehicleStatsReading = { stats: VehicleStats; problems: [] } | { problems: string[] }

export function computeVehicleStats(
  levels: unknown,
  defs: UpgradeDefs = ECONOMY.upgrades,
): VehicleStatsReading {
  const problems = upgradeLevelsProblems(levels)
  if (problems.length > 0) return { problems }
  return { stats: vehicleStatsAt(levels as UpgradeLevels, defs), problems: [] }
}

/** Every problem with a full set of six levels: a missing, unknown or non-integer level. */
export function upgradeLevelsProblems(levels: unknown): string[] {
  if (typeof levels !== 'object' || levels === null) return ['levels must be an object']
  const record = levels as Record<string, unknown>
  return [
    ...Object.keys(record)
      .filter((id) => !isUpgradeId(id))
      .map((id) => `${id} is not a registered upgrade id`),
    ...UPGRADE_IDS.flatMap((id) => upgradeLevelProblems(id, record[id])),
  ]
}

/** One track's level: a safe integer >= 0 (#5: levels are bounded plain integers). */
export function upgradeLevelProblems(upgradeId: string, level: unknown): string[] {
  if (Number.isSafeInteger(level) && (level as number) >= 0) return []
  return [
    `${upgradeId} level must be a safe integer >= 0, got ${JSON.stringify(level) ?? 'nothing'}`,
  ]
}

export function isUpgradeId(id: unknown): id is UpgradeId {
  return (UPGRADE_IDS as readonly unknown[]).includes(id)
}
