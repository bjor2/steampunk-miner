import { describe, expect, it } from 'vitest'
import { lumaOf, rgbOfHex } from '../../../../systems/render/colour'
import { markLadderOfItem } from '../itemMarks'
import { reachedMilestonesOf } from '../markMilestones'
import type { MarkLadder } from '../techNode'
import { fxLookOf, plainLookOf } from './milestoneLook'
import { powerUpFxOf } from './techGear'

// The loaded mobility lane registers the shield with milestones at Marks 3, 6 and 9 (ticket 275).
const SHIELD = 'power.steam_shield'
const curtain = powerUpFxOf('shield-curtain')!

function lookAt(mark: number) {
  return fxLookOf(curtain, reachedMilestonesOf(markLadderOfItem(SHIELD), mark))
}

describe('milestone look', () => {
  it('draws the table look below Mark 3, so an unresearched item looks as it did', () => {
    for (const mark of [0, 1, 2]) expect(lookAt(mark)).toEqual(plainLookOf(curtain))
    expect(plainLookOf(curtain)).toEqual({ colour: '#f2efe6', strandScale: 1, moteScale: 1 })
  })

  it('changes exactly one element per milestone: Mark 3 the tint, Mark 6 the strands, Mark 9 the mote size', () => {
    const plain = plainLookOf(curtain)
    const atThree = lookAt(3)
    const atSix = lookAt(6)
    const atNine = lookAt(9)
    expect(atThree).toEqual({ ...plain, colour: atThree.colour })
    expect(atThree.colour).not.toBe(plain.colour)
    expect(atSix).toEqual({ ...atThree, strandScale: 2 })
    expect(atNine).toEqual({ ...atSix, moteScale: 2 })
    expect(lookAt(5)).toEqual(atThree)
    expect(lookAt(8)).toEqual(atSix)
  })

  it('tints the motes halfway toward the plate gilt and keeps them a readable hex colour', () => {
    const tinted = lookAt(3).colour
    expect(tinted).toMatch(/^#[0-9a-f]{6}$/)
    const luma = lumaOf(rgbOfHex(tinted))
    expect(luma).toBeLessThan(lumaOf(rgbOfHex(curtain.colour)))
    expect(luma).toBeGreaterThan(lumaOf(rgbOfHex('#c9a24b')))
  })

  it('changes nothing for an item whose ladder has no milestones, at any Mark', () => {
    const bare: MarkLadder = { isIncomeItem: false, cooldown: 60 }
    expect(reachedMilestonesOf(bare, 9)).toEqual([])
    expect(reachedMilestonesOf(null, 9)).toEqual([])
    expect(fxLookOf(curtain, reachedMilestonesOf(bare, 9))).toEqual(plainLookOf(curtain))
  })
})
