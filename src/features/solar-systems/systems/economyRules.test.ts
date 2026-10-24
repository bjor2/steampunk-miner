import { describe, expect, it } from 'vitest'
import { systemJumpHardnessStep } from '../../../systems/economy/systemJump'
import { fromCanonical, toCanonical } from '../../../systems/money'
import economyFile from '../solar-systems.economy.json'
import { ECONOMY_ROW_RULES, economyRuleProblems } from './economyRules'

// The economy rows' Systems numbers (ticket 776): read once, refused whole with every problem.

const BLOCK = economyFile.economyRows
const K_JUMP = systemJumpHardnessStep()

function problemsWith(change: Record<string, unknown>, jumpStep = K_JUMP): string[] {
  return economyRuleProblems({ ...BLOCK, ...change }, jumpStep)
}

describe('system economy rules', () => {
  it('ships with no problem: k_s 1.1 beside k_jump 1.1, both under 1.243 and felt at 0.9x', () => {
    expect(economyRuleProblems(BLOCK, K_JUMP)).toEqual([])
    expect(toCanonical(ECONOMY_ROW_RULES.hardStartStep)).toBe(toCanonical(K_JUMP))
    expect(ECONOMY_ROW_RULES.gemShareCapBp).toBe(1500)
  })

  it('refuses a field that is no ratio and a gem cap outside 0 to 10000 bp', () => {
    expect(problemsWith({ hardStartStep: 1.1, gemShareCapBp: 10000 })).toEqual([
      'economyRows.hardStartStep must be a ratio',
      'economyRows.gemShareCapBp must be whole basis points between 0 and 10000',
    ])
  })

  it('refuses a hard start step over the ceiling or felt under 0.9x on paper', () => {
    expect(problemsWith({ hardStartStep: '1.25' })).toEqual([
      'economyRows.hardStartStep must be at most the ceiling',
      'economyRows.hardStartStep is felt under the felt speed floor',
    ])
    expect(problemsWith({ hardStartStep: '1.12' })).toEqual([
      'economyRows.hardStartStep is felt under the felt speed floor',
    ])
    expect(problemsWith({ hardStartStep: '0.9' })).toEqual([
      'economyRows.hardStartStep must be 1 or more',
    ])
  })

  it("refuses the kernel's k_jump over the ceiling", () => {
    expect(problemsWith({}, fromCanonical('1.3'))).toEqual([
      'starMap.systemJump.hardnessStep (k_jump) must be at most the ceiling',
      'starMap.systemJump.hardnessStep (k_jump) is felt under the felt speed floor',
    ])
  })

  it('refuses a felt speed floor over 1 and a pool step floor under 1', () => {
    expect(problemsWith({ feltSpeedFloor: '1.1', poolStepFloor: '0.9' })).toEqual([
      'economyRows.hardStartStep is felt under the felt speed floor',
      'starMap.systemJump.hardnessStep (k_jump) is felt under the felt speed floor',
      'economyRows.feltSpeedFloor must be 1 or less',
      'economyRows.poolStepFloor must be 1 or more',
    ])
  })
})
