import { describe, expect, it } from 'vitest'
import economyFile from '../ores.economy.json'
import familiesFile from '../oreFamilies.json'
import { oreRowProblems } from './oreRows'
import { drawnPositionOf, slotDrawOf } from './slotDraws'

// How a patch draws among its live kinds (ticket 713, Systems' rows on #713): equal weights draw as
// the roster fold always did, `roll % nLive`.

const ROLLS = Array.from({ length: 400 }, (_, at) => at * 7919 + 13)

/** The shipped files with the kinds block's legacy table and default weight replaced. */
function problemsWithKinds(kinds: Record<string, unknown>): string[] {
  const merged = { ...economyFile.ore.kinds, ...kinds }
  return oreRowProblems({ ore: { ...economyFile.ore, kinds: merged } }, familiesFile)
}

describe('the kind draw', () => {
  it('draws roll % n wherever every live kind weighs the same', () => {
    for (const weights of [[3], [3, 3], [3, 3, 3, 3, 3], [1, 1, 1]]) {
      expect(ROLLS.map((roll) => drawnPositionOf(weights, roll))).toEqual(
        ROLLS.map((roll) => roll % weights.length),
      )
    }
  })

  it('gives each kind a run of the rolls as long as its weight', () => {
    const weights = [3, 4, 3, 2]
    const total = 12
    const drawn = Array.from({ length: total }, (_, roll) => drawnPositionOf(weights, roll))
    expect(drawn).toEqual([0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 3, 3])
    expect(drawnPositionOf(weights, total + 5)).toBe(drawnPositionOf(weights, 5))
  })
})

describe('kind slot draw fields', () => {
  const C1 = economyFile.ore.kinds.legacy[0]

  it('reads only the fields a row carries', () => {
    expect(slotDrawOf({ ...C1 })).toEqual({})
    expect(slotDrawOf({ ...C1, drawWeight: 4 })).toEqual({ drawWeight: 4 })
  })

  it('refuses a draw weight or a default weight that is not whole from 1', () => {
    const legacy = [
      { ...C1, drawWeight: 0 },
      ...economyFile.ore.kinds.legacy.slice(1, 3),
      { ...economyFile.ore.kinds.legacy[3], drawWeight: 1.5 },
      ...economyFile.ore.kinds.legacy.slice(4),
    ]
    expect(problemsWithKinds({ legacy, drawWeightDefault: 0 })).toEqual([
      'ore.kinds.drawWeightDefault must be whole, from 1',
      'ore.kinds.legacy[0].drawWeight must be whole, from 1',
      'ore.kinds.legacy[3].drawWeight must be whole, from 1',
    ])
  })
})
