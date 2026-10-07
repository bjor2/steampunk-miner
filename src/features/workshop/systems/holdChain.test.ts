import { describe, expect, it } from 'vitest'
import {
  HOLD_CURVE,
  holdStepTicks,
  isStepDue,
  landStep,
  leaveHoldFocus,
  pressHoldChain,
  refuseStep,
  releaseHoldChain,
  type HoldChain,
  type HoldCurve,
  type StepLanding,
} from './holdChain'

const PRESS_TICK = 100

function gapsOf(ticks: readonly number[]): number[] {
  return ticks.slice(1).map((tick, index) => tick - ticks[index])
}

/** `count` landings, all pips except the 1-based step numbers in `majors`. */
function landingsWithMajorsAt(count: number, majors: readonly number[]): StepLanding[] {
  return Array.from({ length: count }, (_, index) => (majors.includes(index + 1) ? 'major' : 'pip'))
}

/** Steps a hold lands when it is released at `releaseTick`, ticking once per fixed step. */
function stepsBoughtReleasingAt(releaseTick: number): number {
  let chain: HoldChain = pressHoldChain(PRESS_TICK)
  for (let tick = PRESS_TICK; tick <= releaseTick; tick++) {
    if (tick === releaseTick) chain = releaseHoldChain(chain)
    if (isStepDue(chain, tick)) chain = landStep(chain, tick, 'pip')
  }
  return chain.steps
}

describe('workshop hold-to-buy chain', () => {
  it('buys exactly one when the press is released before the wind-up ends', () => {
    expect(stepsBoughtReleasingAt(PRESS_TICK + HOLD_CURVE.windUpTicks - 1)).toBe(1)
  })

  it('repeats once the press outlasts the wind-up', () => {
    expect(stepsBoughtReleasingAt(PRESS_TICK + HOLD_CURVE.windUpTicks + 1)).toBe(2)
  })

  it("follows G&V's table: the wind-up, then 30 down to the 6-tick cap", () => {
    const ticks = holdStepTicks(landingsWithMajorsAt(14, []), PRESS_TICK)

    expect(ticks[0]).toBe(PRESS_TICK)
    expect(gapsOf(ticks)).toEqual([18, 30, 26, 22, 19, 16, 14, 12, 10, 9, 8, 6, 6])
  })

  it('pauses 36 ticks for a major on the cap row, then resumes at 9, 8, 6', () => {
    const ticks = holdStepTicks(landingsWithMajorsAt(18, [14]), PRESS_TICK)

    expect(gapsOf(ticks).slice(12)).toEqual([6, 36, 9, 8, 6])
  })

  it('resumes a major on row 3 at 26, 22, 19', () => {
    const ticks = holdStepTicks(landingsWithMajorsAt(10, [6]), PRESS_TICK)

    expect(gapsOf(ticks).slice(4)).toEqual([19, 36, 26, 22, 19])
  })

  it('resumes a major on row 1 at row 0, never below', () => {
    const ticks = holdStepTicks(landingsWithMajorsAt(7, [4]), PRESS_TICK)

    expect(gapsOf(ticks).slice(2)).toEqual([26, 36, 30, 26])
  })

  it('steps two close majors back two rows each from the row the chain is on', () => {
    const ticks = holdStepTicks(landingsWithMajorsAt(19, [14, 15]), PRESS_TICK)

    expect(gapsOf(ticks).slice(13)).toEqual([36, 36, 12, 10, 9])
  })

  it('never replays the wind-up after a major on the press', () => {
    const ticks = holdStepTicks(landingsWithMajorsAt(4, [1]), PRESS_TICK)

    expect(gapsOf(ticks)).toEqual([36, 30, 26])
  })

  it('ends on a milestone without reading the resume rule', () => {
    const curve: HoldCurve = {
      ...HOLD_CURVE,
      get resumeRowsBack(): number {
        throw new Error('a milestone read resumeRowsBack')
      },
    }
    const ticks = holdStepTicks(['pip', 'pip', 'milestone', 'pip'], PRESS_TICK, curve)

    expect(ticks).toHaveLength(3)
  })

  it('fits 30 held buys with two ordinary majors at the cap in 340 to 400 ticks', () => {
    const ticks = holdStepTicks(landingsWithMajorsAt(30, [15, 25]), PRESS_TICK)
    const duration = ticks[29] - ticks[0]

    expect(duration).toBeGreaterThanOrEqual(340)
    expect(duration).toBeLessThanOrEqual(400)
  })

  it('ends on a refused step and keeps its reason', () => {
    const chain = refuseStep(landStep(pressHoldChain(0), 0, 'pip'), 'max_level')

    expect(chain).toMatchObject({ end: 'refused', refusal: 'max_level', nextStepTick: null })
  })

  it('keeps the first end when the hold is released after a refusal', () => {
    const refused = refuseStep(pressHoldChain(0), 'money_short')

    expect(releaseHoldChain(refused).end).toBe('refused')
  })

  it('stops after the step in flight when focus leaves the plaque', () => {
    const chain = leaveHoldFocus(landStep(pressHoldChain(0), 0, 'pip'))

    expect(chain).toMatchObject({ steps: 1, end: 'focus_left' })
    expect(isStepDue(chain, 1000)).toBe(false)
  })
})
