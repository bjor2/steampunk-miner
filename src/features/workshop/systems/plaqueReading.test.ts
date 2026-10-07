import { describe, expect, it } from 'vitest'
import { UPGRADE_IDS } from '../../../systems/economy/economyDefinition'
import { stepOfMajor } from '../../../systems/economy/upgradeSteps'
import { fromCanonical, ZERO_MONEY } from '../../../systems/money'
import type { ChainPreview } from './chainPreview'
import { PLAQUE_SIDES, pipRowOf, plaqueLineOf, type PlaqueTally } from './plaqueReading'

function previewOf(steps: number, majors = 0, stoppedBy = 'money_short'): ChainPreview {
  return {
    upgradeId: 'engine',
    steps,
    majors,
    spent: ZERO_MONEY,
    reserve: ZERO_MONEY,
    stoppedBy: stoppedBy as ChainPreview['stoppedBy'],
  }
}

function tallyOf(cue: PlaqueTally['cue'], steps = 7): PlaqueTally {
  return { upgradeId: 'engine', steps, spent: fromCanonical('1200'), cue }
}

describe('workshop plaque reading', () => {
  it('fills one rivet pip per step and glows the last when the big level is one buy away', () => {
    expect(pipRowOf(stepOfMajor(2) + 3)).toEqual({ filled: 3, count: 9, isJumpNext: false })
    expect(pipRowOf(stepOfMajor(3) - 1)).toEqual({ filled: 9, count: 9, isJumpNext: true })
    expect(pipRowOf(stepOfMajor(3))).toEqual({ filled: 0, count: 9, isJumpNext: false })
  })

  it('tempts the spree with what a hold buys now', () => {
    expect(plaqueLineOf('engine', null, previewOf(12, 1), ZERO_MONEY).text).toBe(
      'can buy ×12, 1 big level',
    )
    expect(plaqueLineOf('engine', null, previewOf(30, 3, 'preview_limit'), ZERO_MONEY).text).toBe(
      'can buy ×30+, 3 big levels',
    )
    expect(plaqueLineOf('engine', null, previewOf(0), ZERO_MONEY).kind).toBe('quiet')
  })

  it('counts a running hold and its total on its own plaque only', () => {
    expect(plaqueLineOf('engine', tallyOf(null), previewOf(3), ZERO_MONEY)).toEqual({
      kind: 'chain',
      text: '×7 · 1,200',
    })
    expect(plaqueLineOf('boiler', tallyOf(null), previewOf(3), ZERO_MONEY).kind).toBe('tempt')
  })

  it('says what the reserve keeps when it stopped the hold, and stamps MAX at a cap', () => {
    const reserve = fromCanonical('1200')

    expect(plaqueLineOf('engine', tallyOf('reserve_hold'), previewOf(0), reserve)).toEqual({
      kind: 'reserve',
      text: 'keeping 1,200 for service',
    })
    expect(plaqueLineOf('engine', tallyOf('max_stamp'), previewOf(0), reserve).text).toBe('MAX')
    expect(plaqueLineOf('engine', tallyOf('empty_clunk'), previewOf(0), reserve).kind).toBe(
      'stopped',
    )
  })

  it('places every track on one side of the car', () => {
    const placed = [...PLAQUE_SIDES.front, ...PLAQUE_SIDES.rear]

    expect([...placed].sort()).toEqual([...UPGRADE_IDS].sort())
  })
})
