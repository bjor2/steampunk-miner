import { describe, expect, it } from 'vitest'
import { TICKS_PER_SECOND } from '../../../constants/physics'
import { emptyForkPaceTally, type ForkPaceTally } from './forkPace'
import { RUSH_PACE_PINS, rushPaceProblems, type RushSeedRun } from './rushPace'

const MINUTE = 60 * TICKS_PER_SECOND

/** A run that spends `minutes[p - 1]` on each planet p, arrival to core, back to back. */
function tallyOf(minutes: readonly number[]): ForkPaceTally {
  const tally = emptyForkPaceTally()
  let tick = 0
  minutes.forEach((planetMinutes, index) => {
    tally.arrivalTick.set(index + 1, tick)
    tick += planetMinutes * MINUTE
    tally.coreTick.set(index + 1, tick)
  })
  return tally
}

const ON_CURVE = [20, 25, 25, 25, 25, 25, 25, 25, 25, 25]

function seedOf(plain: readonly number[], rush: readonly number[], worldSeed = 1): RushSeedRun {
  return { worldSeed, plain: tallyOf(plain), rush: tallyOf(rush) }
}

describe('tech tree: the rush pace asserts (#411)', () => {
  it('passes a rush that plays the plain curve', () => {
    expect(rushPaceProblems([seedOf(ON_CURVE, ON_CURVE)])).toEqual([])
  })

  it('fails a planet 1 outside 15 to 30 minutes', () => {
    const quick = [14, ...ON_CURVE.slice(1)]
    expect(rushPaceProblems([seedOf(quick, quick)])).toEqual([
      'planet 1 took 14.0 min on the rush median, outside 15 to 30',
    ])
  })

  it('fails a later planet under 22 minutes', () => {
    const rushed = ON_CURVE.map((minutes, index) => (index === 4 ? 21 : minutes))
    expect(rushPaceProblems([seedOf(rushed, rushed)])).toEqual([
      'planet 5 took 21.0 min on the rush median, under 22',
    ])
  })

  it('fails a rush that reaches a core sooner than 0.98 of the plain bot', () => {
    const slowPlain = ON_CURVE.map((minutes) => minutes + 2)
    const problems = rushPaceProblems([seedOf(slowPlain, ON_CURVE)])
    expect(problems.length).toBe(RUSH_PACE_PINS.lastPlanet)
    expect(problems[0]).toBe(
      "planet 1's core at 20.0 min on the rush median, under 0.98x the plain bot's 22.0",
    )
  })

  it('judges the median of the seeds, and names a seed that never finished', () => {
    const unfinished = { ...seedOf(ON_CURVE, ON_CURVE, 3), rush: tallyOf(ON_CURVE.slice(0, 9)) }
    const runs = [seedOf(ON_CURVE, ON_CURVE, 1), seedOf(ON_CURVE, ON_CURVE, 2), unfinished]
    expect(rushPaceProblems(runs)).toEqual(["seed 3: the rush never completed planet 10's core"])
  })
})
