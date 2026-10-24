/**
 * The jump between solar systems (ticket 759), the `starMap.systemJump` block of economy.json
 * (`starMapRules.ts`): the hardness step a system jump takes and the jump drive's price. The fuel
 * a jump between systems burns is `jumpFuel.ts`'s, times J.
 *
 * k_jump is the Producer's GD lock on #759 (1.10, about 0.91x felt speed on paper): each system's
 * rock is k_jump harder than the system before at the same campaign index, so every jump between
 * systems is felt as a step while g itself advances by one planet, as any p to p + 1 does (#781,
 * VS: no value step at the jump). In system s the step is `k_jump^(s - 1)`, 1 in system 1, so
 * today's planet line is untouched. Bignum through `powInt`, finite at s = 1e6.
 *
 * The jump drive (the GD lock on #650, comment 6361556890: a money-priced node, the one new
 * stats.json row) is bought once, for `driveRunValues` run values R of a system's last planet:
 * priced to arrive with the first system's end (Bjor's price-only ruling on #411).
 */
import { mul, powInt, type BigStat, type Money } from '../money'
import { jumpsBeforeSystem } from '../starMap/planetAddress'
import { ECONOMY } from './economy'
import { runValueOf } from './jumpFuel'

const { planetsPerSystem, systemJump } = ECONOMY.starMap

let lastStep: { system: bigint; step: BigStat } | null = null

/** `k_jump^(s - 1)`: how much harder system `system`'s rock is than system 1's at the same g. */
export function systemHardnessStepOf(system: bigint): BigStat {
  if (lastStep === null || lastStep.system !== system) {
    lastStep = { system, step: powInt(systemJump.hardnessStep, jumpsBeforeSystem(system)) }
  }
  return lastStep.step
}

/** What the jump drive costs: `driveRunValues` runs of a system's last planet. */
export function jumpDrivePrice(): Money {
  return mul(systemJump.driveRunValues, runValueOf(planetsPerSystem))
}
