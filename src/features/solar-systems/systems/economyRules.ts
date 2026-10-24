/**
 * The Systems numbers of a solar system's economy rows (ticket 776, spec #774; the GD lock of
 * 23 Oct 2026 on Campaign Scaling and its VS input), the `economyRows` block of
 * `solar-systems.economy.json`, read once here and refused whole with every problem listed:
 *
 * - `hardnessStepCeiling`, the VS's 1.243: the most a planet's ground steps over the planet before
 *   at arrival, the system jump's k_jump (kernel `starMap.systemJump.hardnessStep`) and the hard
 *   start's k_s alike;
 * - `hardStartStep`, k_s: the hard start's ground over its system's standard ground;
 * - `feltSpeedFloor`, the gate both steps pass: felt speed on arrival at least 0.9x the planet
 *   before, which on paper is `1 / step`, so a step over `1 / floor` is refused here already (the
 *   bot run judges it after the fee);
 * - `poolStepFloor`, R3: each planet's ore pool value at least 1.15x the planet before's;
 * - `gemShareCapBp`, the gem tier's most of a planet's pool value (#741).
 */
import { systemJumpHardnessStep } from '../../../systems/economy/systemJump'
import {
  cmp,
  fromCanonical,
  fromSafeInteger,
  isMoneyText,
  mul,
  type BigStat,
} from '../../../systems/money'
import economyFile from '../solar-systems.economy.json'

export interface EconomyRowRules {
  hardnessStepCeiling: BigStat
  /** k_s: the hard start's ground over its system's standard ground. */
  hardStartStep: BigStat
  feltSpeedFloor: BigStat
  poolStepFloor: BigStat
  gemShareCapBp: number
}

type Raw = Record<string, unknown>

const BLOCK = 'economyRows'
const BASIS_POINTS = 10000
const RATIO_FIELDS = ['hardnessStepCeiling', 'hardStartStep', 'feltSpeedFloor', 'poolStepFloor']
const ONE = fromSafeInteger(1)

export const ECONOMY_ROW_RULES: EconomyRowRules = loadRules(economyFile.economyRows)

/** Why the block is not ticket 776's; empty when it is. `jumpStep` is the kernel's k_jump. */
export function economyRuleProblems(block: unknown, jumpStep: BigStat): string[] {
  const raw = asMap(block)
  const textProblems = [
    ...RATIO_FIELDS.flatMap((key) => ratioProblems(raw, key)),
    ...capProblems(raw),
  ]
  if (textProblems.length > 0) return textProblems
  return stepProblems(rulesOf(raw), jumpStep)
}

function loadRules(block: unknown): EconomyRowRules {
  const problems = economyRuleProblems(block, systemJumpHardnessStep())
  if (problems.length > 0)
    throw new Error(`The solar-systems economy rows are refused:\n${problems.join('\n')}`)
  return rulesOf(asMap(block))
}

function rulesOf(raw: Raw): EconomyRowRules {
  return {
    hardnessStepCeiling: fromCanonical(raw.hardnessStepCeiling as string),
    hardStartStep: fromCanonical(raw.hardStartStep as string),
    feltSpeedFloor: fromCanonical(raw.feltSpeedFloor as string),
    poolStepFloor: fromCanonical(raw.poolStepFloor as string),
    gemShareCapBp: raw.gemShareCapBp as number,
  }
}

function ratioProblems(raw: Raw, key: string): string[] {
  return isMoneyText(raw[key]) ? [] : [`${BLOCK}.${key} must be a ratio`]
}

function capProblems(raw: Raw): string[] {
  const cap = raw.gemShareCapBp
  const isShare = Number.isSafeInteger(cap) && (cap as number) > 0 && (cap as number) < BASIS_POINTS
  return isShare ? [] : [`${BLOCK}.gemShareCapBp must be whole basis points between 0 and 10000`]
}

function stepProblems(rules: EconomyRowRules, jumpStep: BigStat): string[] {
  return [
    ...stepRangeProblems(rules, rules.hardStartStep, `${BLOCK}.hardStartStep`),
    ...stepRangeProblems(rules, jumpStep, 'starMap.systemJump.hardnessStep (k_jump)'),
    ...(cmp(rules.feltSpeedFloor, ONE) <= 0 ? [] : [`${BLOCK}.feltSpeedFloor must be 1 or less`]),
    ...(cmp(rules.poolStepFloor, ONE) >= 0 ? [] : [`${BLOCK}.poolStepFloor must be 1 or more`]),
  ]
}

/** A step is 1 or more, under the ceiling, and felt on paper (`1 / step`) at the floor or above. */
function stepRangeProblems(rules: EconomyRowRules, step: BigStat, name: string): string[] {
  return [
    ...(cmp(step, ONE) >= 0 ? [] : [`${name} must be 1 or more`]),
    ...(cmp(step, rules.hardnessStepCeiling) <= 0 ? [] : [`${name} must be at most the ceiling`]),
    ...(isFeltAtFloor(rules, step) ? [] : [`${name} is felt under the felt speed floor`]),
  ]
}

function isFeltAtFloor(rules: EconomyRowRules, step: BigStat): boolean {
  return cmp(mul(step, rules.feltSpeedFloor), ONE) <= 0
}

function asMap(value: unknown): Raw {
  return typeof value === 'object' && value !== null ? (value as Raw) : {}
}
