import { describe, expect, it } from 'vitest'
import { fromCanonical } from '../systems/money'
import { casingPolicyProblemsOf, planetTicksOf, type CasingPolicyRun } from './casingPolicyBars'

// Ticket 829's bot rows as the lane judges them (`casingPolicy.lane.test.ts`).

function runOf(over: Partial<CasingPolicyRun> = {}): CasingPolicyRun {
  return {
    worldSeed: 1,
    coreTicks: new Map([
      [1, 1000],
      [2, 3000],
      [3, 6000],
    ]),
    earned: fromCanonical('6000'),
    ticks: 6000,
    bursts: 0,
    gradesBought: new Map([
      [1, 4],
      [2, 4],
      [3, 4],
    ]),
    ...over,
  }
}

const ON_CURVE = [runOf(), runOf(), runOf()]

describe('casing policy bars (ticket 829)', () => {
  it('reads each planet time from the core before it', () => {
    expect([1, 2, 3].map((planet) => planetTicksOf(runOf(), planet))).toEqual([1000, 2000, 3000])
  })

  it('passes runs that hold every bot row', () => {
    const skip = [runOf({ earned: fromCanonical('3000') })]
    const oneShort = [
      runOf({
        coreTicks: new Map([
          [1, 1050],
          [2, 3100],
          [3, 6150],
        ]),
      }),
    ]
    expect(casingPolicyProblemsOf({ onCurve: ON_CURVE, oneShort, skip })).toEqual([])
  })

  it('refuses an on-curve bot that bursts or buys a planet short of its four grades', () => {
    const onCurve = [
      runOf({
        bursts: 2,
        gradesBought: new Map([
          [2, 3],
          [3, 4],
        ]),
      }),
    ]
    expect(casingPolicyProblemsOf({ onCurve, oneShort: onCurve, skip: [] })).toEqual([
      'the on-curve bot burst 2 times',
      'P2: bought 3 grades',
    ])
  })

  it('refuses a one-short run that loses more than 5% of a planet', () => {
    const oneShort = [
      runOf({
        coreTicks: new Map([
          [1, 1000],
          [2, 3200],
          [3, 6200],
        ]),
      }),
    ]
    expect(casingPolicyProblemsOf({ onCurve: ON_CURVE, oneShort, skip: [] })).toEqual([
      'P2: one grade short took 110.00% of the on-curve time',
    ])
  })

  it('refuses a skip run that earns as much a minute as casing', () => {
    expect(
      casingPolicyProblemsOf({ onCurve: ON_CURVE, oneShort: ON_CURVE, skip: ON_CURVE }),
    ).toEqual(['skipping casing earned as much per minute as casing on the curve'])
  })
})
