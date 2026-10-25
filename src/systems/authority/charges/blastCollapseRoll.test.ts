import { describe, expect, it } from 'vitest'
import { isPlanetOfSystem, planetParamsAt } from '../../starMap/systemPlanetParams'
import type { CollapseBlock } from '../../world/collapseBlock'
import { freshPlanetParamsFor } from '../../world/planetParams'
import { collapseRollOf, isRolledToCollapse } from './blastCollapseRoll'

const SEED = 83921
const PLANET_1 = freshPlanetParamsFor(SEED, 1)

/** 4,096 blocks of a 64 x 64 chunk patch round the origin, every block index of each. */
const BLOCKS: CollapseBlock[] = Array.from({ length: 64 }, (_, at) => ({
  cx: (at % 8) - 4,
  cy: Math.floor(at / 8) - 4,
})).flatMap(({ cx, cy }) => Array.from({ length: 64 }, (_, index) => ({ cx, cy, index })))

function rollsOf(params = PLANET_1, blastSeq = 0): number[] {
  return BLOCKS.map((block) => collapseRollOf(params, block, blastSeq))
}

function shareUnder(rolls: readonly number[], collapseBp: number): number {
  return rolls.filter((roll) => isRolledToCollapse(roll, collapseBp)).length / rolls.length
}

function firstIndexOfSystem2(): number {
  let index = 1
  while (!isPlanetOfSystem(2n, index)) index++
  return index
}

function changedShare(a: readonly number[], b: readonly number[]): number {
  return a.filter((roll, at) => roll !== b[at]).length / a.length
}

describe('bare blast collapse roll (ticket 861)', () => {
  it('draws whole basis points from 0 to 9999', () => {
    const rolls = rollsOf()
    expect(rolls.every((roll) => Number.isInteger(roll) && roll >= 0 && roll < 10000)).toBe(true)
  })

  it('draws the same roll for the same planet, block and blast however often it is asked', () => {
    const block = { cx: 3, cy: -2, index: 17 }
    expect(collapseRollOf(PLANET_1, block, 41)).toBe(collapseRollOf(PLANET_1, block, 41))
    expect(rollsOf(PLANET_1, 7)).toEqual(rollsOf(PLANET_1, 7))
  })

  it("draws afresh for the session's next blast, past 2^32 blasts too", () => {
    expect(changedShare(rollsOf(PLANET_1, 0), rollsOf(PLANET_1, 1))).toBeGreaterThan(0.99)
    const past32 = 2 ** 32 + 5
    expect(changedShare(rollsOf(PLANET_1, 5), rollsOf(PLANET_1, past32))).toBeGreaterThan(0.99)
  })

  it('draws apart on another planet, on the same campaign index of another system and on another world seed', () => {
    const planet2 = freshPlanetParamsFor(SEED, 2)
    expect(changedShare(rollsOf(), rollsOf(planet2))).toBeGreaterThan(0.99)
    const index = firstIndexOfSystem2()
    const inSystem1 = planetParamsAt(SEED, 1n, index)
    const inSystem2 = planetParamsAt(SEED, 2n, index)
    expect(changedShare(rollsOf(inSystem1), rollsOf(inSystem2))).toBeGreaterThan(0.99)
    expect(changedShare(rollsOf(), rollsOf(freshPlanetParamsFor(SEED + 1, 1)))).toBeGreaterThan(
      0.99,
    )
  })

  it('collapses about the share of blocks its collapseBp names and none at 0', () => {
    const rolls = rollsOf()
    expect(shareUnder(rolls, 0)).toBe(0)
    expect(shareUnder(rolls, 10000)).toBe(1)
    for (const collapseBp of [1250, 2500, 3750, 5000]) {
      expect(Math.abs(shareUnder(rolls, collapseBp) - collapseBp / 10000)).toBeLessThan(0.02)
    }
  })
})
