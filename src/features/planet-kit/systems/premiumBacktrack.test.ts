import { describe, expect, it } from 'vitest'
import { runValueOf } from '../../../systems/economy/jumpFuel'
import { cmp, div, fromSafeInteger, mul } from '../../../systems/money'
import {
  premiumBacktrackOf,
  premiumBacktrackProblemsOf,
  premiumBacktracks,
} from './premiumBacktrack'

// The ore-premium backtrack bar (ticket 826, PK7; Systems' row 4 on the GD lock of 24 Oct): going
// back one planet for a whole premium run, and jumping there and back, earns less a run than the
// frontier at every g from 2 to 10.

describe('planet kit: the ore-premium backtrack bar (ticket 826)', () => {
  it('holds at every g from 2 to 10', () => {
    const backtracks = premiumBacktracks()
    expect(backtracks.map(({ frontier }) => frontier)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(premiumBacktrackProblemsOf(backtracks)).toEqual([])
  })

  it('lifts the whole run behind by the merchant premium and pays the round trip out of it', () => {
    const { backtrackNet } = premiumBacktrackOf(3)
    const premiumRun = div(mul(runValueOf(2), fromSafeInteger(5)), fromSafeInteger(4))
    expect(cmp(backtrackNet, premiumRun)).toBeLessThan(0)
  })

  it('names the frontier a backtrack would beat', () => {
    const backtrack = { ...premiumBacktrackOf(4), frontierRun: fromSafeInteger(0) }
    expect(premiumBacktrackProblemsOf([backtrack])).toEqual([
      expect.stringMatching(/^g 4: a premium backtrack nets .* not under the frontier's 0\.0$/),
    ])
  })
})
