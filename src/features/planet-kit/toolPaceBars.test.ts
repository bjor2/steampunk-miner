import { describe, expect, it } from 'vitest'
import { fromSafeInteger } from '../../systems/money'
import { paybackOf, toolPaceProblemsOf, type ToolPaceRow } from './toolPaceBars'
import { TOOL_HANDS } from './toolPaceRuns'

// The bars of the tools on/off replay (ticket 881; Systems and the VS on #850), on hand-made rows:
// payback is the money-per-minute gain times the minutes acted over the debited price, and each
// bar names its miss.

const ROW: ToolPaceRow = {
  itemId: 'scree_plough',
  planet: 2,
  payback: 2,
  minutesOn: 50,
  minutesBare: 49,
  actingMinutes: 6,
  planetsUnderFloor: [],
}

describe('tool pace bars', () => {
  it('pays back the gain per minute times the minutes acted over the debited price', () => {
    const spent = { actingTicks: 6 * 3600, debit: fromSafeInteger(300) }
    expect(paybackOf(fromSafeInteger(250), fromSafeInteger(150), spent)).toBe(2)
    expect(paybackOf(null, fromSafeInteger(150), spent)).toBeNull()
  })

  it('passes a row inside every bar', () => {
    expect(toolPaceProblemsOf([ROW])).toEqual([])
  })

  it('names a payback outside 1 to 3, felt speed past 5% and a planet under 22 minutes', () => {
    const missed = { ...ROW, payback: 3.5, minutesOn: 52, planetsUnderFloor: [2] }
    expect(toolPaceProblemsOf([missed])).toEqual([
      'scree_plough: payback 3.50x its price on planet 2, outside 1 to 3: tune its price in data',
      "scree_plough: 52.0 min to planet 2's core, outside 5% of bare's 49.0",
      'scree_plough: planet 2 under 22 min',
    ])
  })

  it('plays one tools-on run per hazard tool to its home planet, the flask under its policy', () => {
    expect(TOOL_HANDS.map((hand) => [hand.itemId, hand.grants, hand.lastPlanet])).toEqual([
      ['scree_plough', 1, 2],
      ['damp_flask', 3, 3],
      ['shard_tongs', 1, 4],
      ['vent_vane', 1, 5],
    ])
    expect(TOOL_HANDS.map((hand) => hand.kitPolicy.flask)).toEqual([
      'never',
      'on_firedamp_entry',
      'never',
      'never',
    ])
  })
})
