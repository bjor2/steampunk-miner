/**
 * Why a system's economy rows break the Campaign Scaling lock (ticket 776, spec #774; VS input);
 * empty when they hold. Each problem names the planet by its address `s.p`:
 *
 * - no value step at the jump: every planet's V(t) steps over the planet before's exactly as a
 *   p -> p + 1 inside system 1 does (`tiersPerPlanet` tiers);
 * - the arrival hardness step at most the ceiling (1.243) and felt on paper (`1 / step`) at the
 *   floor (0.9x) or above, which also refuses the hard start stacked on the jump step;
 * - the hard start never on a system's first planet;
 * - R3 with the gem cap: the pool value at least 1.15x the planet before's even when the planet
 *   before sold its gems at the full 15% of its pool and this planet sold none;
 * - gems sold, every gem tier above the planet's top band.
 */
import { compoundRatio } from '../../../systems/economy/curveFamilies'
import { ECONOMY } from '../../../systems/economy/economy'
import { cmp, fromSafeInteger, mul, type BigStat } from '../../../systems/money'
import { ECONOMY_ROW_RULES, type EconomyRowRules } from './economyRules'
import type { PlanetEconomyRow } from './economyRows'

const BASIS_POINTS = 10000
const ONE = fromSafeInteger(1)
const FIRST_PLACE = '1'

export function economyRowProblemsOf(
  rows: readonly PlanetEconomyRow[],
  rules: EconomyRowRules = ECONOMY_ROW_RULES,
): string[] {
  return rows.flatMap((row) => rowProblemsOf(row, rules))
}

function rowProblemsOf(row: PlanetEconomyRow, rules: EconomyRowRules): string[] {
  const where = `planet ${row.id.system}.${row.id.planet}`
  return [
    ...valueStepProblems(row, where),
    ...arrivalStepProblems(row, rules, where),
    ...hardStartProblems(row, where),
    ...poolStepProblems(row, rules, where),
    ...gemTierProblems(row, where),
  ]
}

function valueStepProblems(row: PlanetEconomyRow, where: string): string[] {
  const usual = compoundRatio(ECONOMY.ore.valueRatio, ECONOMY.ore.tiersPerPlanet)
  return cmp(row.valueStep, usual) === 0
    ? []
    : [`${where}: its values step off the usual p -> p + 1 step`]
}

function arrivalStepProblems(row: PlanetEconomyRow, rules: EconomyRowRules, where: string) {
  return [
    ...(cmp(row.arrivalStep, rules.hardnessStepCeiling) <= 0
      ? []
      : [`${where}: its ground steps over the hardness ceiling on arrival`]),
    ...(isFeltAtFloor(row.arrivalStep, rules)
      ? []
      : [`${where}: its arrival step is felt under the felt speed floor`]),
  ]
}

function isFeltAtFloor(step: BigStat, rules: EconomyRowRules): boolean {
  return cmp(mul(step, rules.feltSpeedFloor), ONE) <= 0
}

function hardStartProblems(row: PlanetEconomyRow, where: string): string[] {
  const isHardFirst = row.surface === 'hard' && row.id.planet === FIRST_PLACE
  return isHardFirst ? [`${where}: a hard start on a system's first planet stacks on the jump`] : []
}

/** R3 at its worst: the pool before at the gem cap, this one with no gems. */
function poolStepProblems(row: PlanetEconomyRow, rules: EconomyRowRules, where: string) {
  const commonShare = fromSafeInteger(BASIS_POINTS - rules.gemShareCapBp)
  const worstStep = mul(row.poolStep, commonShare)
  const floor = mul(rules.poolStepFloor, fromSafeInteger(BASIS_POINTS))
  return cmp(worstStep, floor) >= 0
    ? []
    : [`${where}: its pool steps under the R3 floor with the gems at their cap`]
}

function gemTierProblems(row: PlanetEconomyRow, where: string): string[] {
  const topBand = row.bandTiers.at(-1) ?? 0
  if (row.gemSaleTiers.length === 0) return [`${where}: it sells no gems`]
  return row.gemSaleTiers.every((tier) => tier > topBand)
    ? []
    : [`${where}: a gem sells at or under its top band's tier`]
}
