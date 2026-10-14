import { describe, expect, it } from 'vitest'
import economyFile from '../mobility.economy.json'
import { MOBILITY_FORK_NUMBERS, readMobilityForkNumbers } from './mobilityForkEconomy'

// The mobility fork's numbers (ticket 268): read whole from the `forks` block, refused whole.

type EditableFile = { forks: Record<string, unknown> }

function fileWithArmoured(row: Record<string, unknown>): EditableFile {
  const file: EditableFile = structuredClone(economyFile)
  file.forks.armoured = row
  return file
}

describe('mobility fork economy', () => {
  it("reads Agile's air boost and Armoured's grounded share and curtain ticks", () => {
    expect(MOBILITY_FORK_NUMBERS).toEqual({
      agile: { airBoostBp: 1000 },
      armoured: { groundedDamageScaleBp: 7500, curtainExtraTicks: 60 },
    })
  })

  it('refuses the block on a negative or fractional number', () => {
    expect(
      readMobilityForkNumbers(
        fileWithArmoured({ groundedDamageScaleBp: -1, curtainExtraTicks: 60 }),
      ),
    ).toEqual({ problems: ['forks.armoured.groundedDamageScaleBp must be a whole number from 0'] })
    const fractional = readMobilityForkNumbers(
      fileWithArmoured({ groundedDamageScaleBp: 7500, curtainExtraTicks: 0.5 }),
    )
    expect('problems' in fractional).toBe(true)
  })
})
