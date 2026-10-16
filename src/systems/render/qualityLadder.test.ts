import { describe, expect, it } from 'vitest'
import { LOWEST_QUALITY_RUNG } from './renderQuality'
import {
  createQualityLadder,
  resetQualityLadder,
  stepQualityLadder,
  type QualityLadder,
} from './qualityLadder'
import type { FrameVerdict } from './renderScale'

function runSeconds(
  ladder: QualityLadder,
  verdict: FrameVerdict,
  seconds: number,
  isScaleAtFloor = true,
): void {
  for (let second = 0; second < seconds; second++) {
    stepQualityLadder(ladder, { verdict, isScaleAtFloor })
  }
}

describe('render quality ladder (TD #470 section 2.4, ticket 477)', () => {
  it('stays on the preset while the render scale can still step down', () => {
    const ladder = createQualityLadder()
    runSeconds(ladder, 'missed', 10, false)
    expect(ladder.rung).toBe(0)
  })

  it('goes down a rung at most every 2 s once the render scale sits at its floor', () => {
    const ladder = createQualityLadder()
    runSeconds(ladder, 'missed', 1)
    expect(ladder.rung).toBe(1)
    runSeconds(ladder, 'missed', 1)
    expect(ladder.rung).toBe(1)
    runSeconds(ladder, 'missed', 1)
    expect(ladder.rung).toBe(2)
  })

  it('stops at the lowest rung', () => {
    const ladder = createQualityLadder()
    runSeconds(ladder, 'missed', 30)
    expect(ladder.rung).toBe(LOWEST_QUALITY_RUNG)
  })

  it('holds a rung through seconds that neither miss nor meet the budget', () => {
    const ladder = createQualityLadder()
    runSeconds(ladder, 'missed', 1)
    runSeconds(ladder, 'held', 120)
    expect(ladder.rung).toBe(1)
  })

  it('climbs back one rung after a minute of met seconds in a row, the slow re-probe', () => {
    const ladder = createQualityLadder()
    runSeconds(ladder, 'missed', 3)
    expect(ladder.rung).toBe(2)
    runSeconds(ladder, 'met', 59)
    expect(ladder.rung).toBe(2)
    runSeconds(ladder, 'met', 1)
    expect(ladder.rung).toBe(1)
  })

  it('starts the minute again after a second that missed', () => {
    const ladder = createQualityLadder()
    runSeconds(ladder, 'missed', 1)
    runSeconds(ladder, 'met', 40)
    runSeconds(ladder, 'missed', 1, false)
    runSeconds(ladder, 'met', 40)
    expect(ladder.rung).toBe(1)
  })

  it('starts from the preset again after a reset', () => {
    const ladder = createQualityLadder()
    runSeconds(ladder, 'missed', 5)
    resetQualityLadder(ladder)
    expect(ladder.rung).toBe(0)
    runSeconds(ladder, 'missed', 1)
    expect(ladder.rung).toBe(1)
  })
})
