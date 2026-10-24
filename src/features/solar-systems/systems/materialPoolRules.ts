/**
 * The Systems numbers of the generated material pool (ticket 777, spec #774; the GD lock of 23 Oct
 * 2026 on Campaign Scaling), the `materialPool` block of `solar-systems.economy.json`, read once
 * here and refused whole with every problem listed:
 *
 * - `kindsTarget`: about 15 kinds a planet (Bjor's ask of 15 Oct on #647), never past the ores
 *   slice's `rosterMaxKinds` (17, the 8-bit slot; the HS pool lock on #647), which this reads
 *   rather than restates;
 * - the gem count is the ores slice's: one gem per step of its `tierLeads` ladder (three).
 */
import { ORE_ROWS } from '../../ores'
import economyFile from '../solar-systems.economy.json'

export interface MaterialPoolRules {
  kindsTarget: number
  /** The ores slice's roster cap: a planet never holds more kinds. */
  kindsCap: number
  /** The gems a pool sells, cheapest first: the ores slice's gem ladder. */
  gemCount: number
}

type Raw = Record<string, unknown>

const BLOCK = 'materialPool'

export const MATERIAL_POOL_RULES: MaterialPoolRules = loadRules(economyFile.materialPool)

/** Why the block is not ticket 777's; empty when it is. `kindsCap` is the ores slice's cap. */
export function materialPoolRuleProblems(block: unknown, kindsCap: number): string[] {
  const target = asMap(block).kindsTarget
  const isTarget = Number.isSafeInteger(target) && (target as number) >= 1
  if (!isTarget) return [`${BLOCK}.kindsTarget must be a whole number from 1`]
  return (target as number) <= kindsCap
    ? []
    : [`${BLOCK}.kindsTarget ${String(target)} is over the ${kindsCap}-kind roster cap`]
}

function loadRules(block: unknown): MaterialPoolRules {
  const kindsCap = ORE_ROWS.kinds.rosterMaxKinds
  const problems = materialPoolRuleProblems(block, kindsCap)
  if (problems.length > 0)
    throw new Error(`The solar-systems material pool is refused:\n${problems.join('\n')}`)
  return {
    kindsTarget: asMap(block).kindsTarget as number,
    kindsCap,
    gemCount: ORE_ROWS.gems.tierLeads.length,
  }
}

function asMap(value: unknown): Raw {
  return typeof value === 'object' && value !== null ? (value as Raw) : {}
}
