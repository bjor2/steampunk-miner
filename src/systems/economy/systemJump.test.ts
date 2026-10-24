import { describe, expect, it } from 'vitest'
import { campaignIndex, planetIndexOfCampaign } from '../starMap/campaignIndex'
import { ceilMilli, cmp, div, fromCanonical, mul, toCanonical, type Money } from '../money'
import { ECONOMY } from './economy'
import {
  jumpFeeOf,
  jumpFuelUnitsOf,
  runValueOf,
  systemJumpFeeOf,
  systemJumpFuelUnitsOf,
} from './jumpFuel'
import { jumpDrivePrice, systemHardnessStepOf } from './systemJump'

function expectAmount(amount: Money, text: string): void {
  expect(toCanonical(amount)).toBe(toCanonical(fromCanonical(text)))
}

const LAST_PLACE = BigInt(ECONOMY.starMap.planetsPerSystem)

/** The planet indexes of system `system`'s last planet and the next system's first. */
function jumpOutOf(system: bigint): [number, number] {
  return [
    planetIndexOfCampaign(campaignIndex(system, LAST_PLACE)),
    planetIndexOfCampaign(campaignIndex(system + 1n, 1n)),
  ]
}

/**
 * The bignum goldens of ticket 759 (the VS bars on #650: s = 1, 2, 10 and 1e6): out of system s's
 * last planet into the next system's first, `[s, from g, to g, units, fee, k_jump^(s - 1)]`.
 * Re-pinned by ticket 776's J of 1.4 (7 units where 1.2 burnt 6); g and the step are unchanged.
 */
const SYSTEM_JUMP_GOLDENS: readonly (readonly [bigint, number, number, string, string, string])[] =
  [
    [1n, 5, 6, '7', '45978.859', '1'],
    [2n, 10, 11, '7', '20133861.22', '1.1'],
    [10n, 50, 51, '7', '2.7219375534623421932420971915896e+28', '2.357947691'],
    [
      1000000n,
      5000000,
      5000001,
      '7',
      '8.07280603256849088768777133150266671609e+2641370',
      '4.403170878211849861695382883421093758459e+41392',
    ],
  ]

describe('jump between solar systems (ticket 759)', () => {
  it('burns J times the same distance inside a system, rounded up to whole units', () => {
    expectAmount(systemJumpFuelUnitsOf(5, 6), '7')
    expectAmount(jumpFuelUnitsOf(5, 6), '5')
    expectAmount(systemJumpFuelUnitsOf(6, 5), '7')
    expectAmount(systemJumpFuelUnitsOf(1, 6), '13')
  })

  it("prices a jump between systems at the destination's unit price, J above the same hop", () => {
    const unitsRatio = div(systemJumpFuelUnitsOf(5, 6), jumpFuelUnitsOf(5, 6))
    expectAmount(unitsRatio, '1.4')
    expectAmount(systemJumpFeeOf(5, 6), toCanonical(ceilMilli(mul(unitsRatio, jumpFeeOf(5, 6)))))
    expect(cmp(systemJumpFeeOf(6, 5), systemJumpFeeOf(5, 6))).toBe(-1)
  })

  it('steps rock hardness by k_jump for each system past the first, so system 1 is untouched', () => {
    expectAmount(systemHardnessStepOf(1n), '1')
    expectAmount(systemHardnessStepOf(2n), '1.1')
    expectAmount(systemHardnessStepOf(3n), '1.21')
  })

  it('advances g by one planet out of a system, so the jump is the hop to p + 1 times J', () => {
    for (const [system] of SYSTEM_JUMP_GOLDENS) {
      const [from, to] = jumpOutOf(system)
      expect(to - from).toBe(1)
      expectAmount(systemJumpFuelUnitsOf(from, to), '7')
    }
  })

  it('holds the bignum goldens at s = 1, 2, 10 and 1e6, the same on every call', () => {
    for (const [system, fromG, toG, units, fee, step] of SYSTEM_JUMP_GOLDENS) {
      const [from, to] = jumpOutOf(system)
      expect([from, to]).toEqual([fromG, toG])
      expect(toCanonical(systemJumpFuelUnitsOf(from, to))).toBe(toCanonical(fromCanonical(units)))
      expect(toCanonical(systemJumpFeeOf(from, to))).toBe(toCanonical(fromCanonical(fee)))
      expect(toCanonical(systemHardnessStepOf(system))).toBe(toCanonical(fromCanonical(step)))
      expect(toCanonical(systemJumpFeeOf(from, to))).toBe(toCanonical(systemJumpFeeOf(from, to)))
    }
  })

  it("prices the jump drive at one run value of a system's last planet", () => {
    expectAmount(jumpDrivePrice(), toCanonical(mul(fromCanonical('1'), runValueOf(5))))
    expectAmount(jumpDrivePrice(), '65684.08355712890625')
  })
})
