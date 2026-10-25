/**
 * The cargo a scenario puts in a container (`debug.planet-kit.placeContainer`, ticket 823): ore
 * units per tier as decimal text, the way counts cross JSON (decision #5), read into the kernel's
 * `Cargo` once every entry checks out. A bad entry refuses the whole scenario, never trims it.
 */
import type { Cargo } from '../../../systems/vehicle/vehicleState'

const TIER_KEY = /^[1-9][0-9]*$/
const UNITS_TEXT = /^[1-9][0-9]*$/

/** Why `ore` is not whole units per ore tier; empty when it is. */
export function scenarioCargoProblems(ore: Readonly<Record<string, string>>): string[] {
  return Object.entries(ore).flatMap(([tier, units]) => oreEntryProblems(tier, units))
}

/** The cargo; call only on ore `scenarioCargoProblems` accepts. */
export function scenarioCargoOf(
  ore: Readonly<Record<string, string>>,
  coreFragments: number,
): Cargo {
  const units = Object.entries(ore).map(([tier, text]) => [tier, BigInt(text)])
  return { ore: Object.fromEntries(units), coreFragments }
}

function oreEntryProblems(tier: string, units: string): string[] {
  if (!TIER_KEY.test(tier)) return [`ore tier "${tier}" is not a tier from 1`]
  if (!isWholeUnitsText(units)) return [`ore.${tier} must be whole units from 1 as text`]
  return []
}

/** Any whole count from 1 (ticket 849): a scenario may fill a hold past the safe integers. */
function isWholeUnitsText(units: string): boolean {
  return UNITS_TEXT.test(units)
}
