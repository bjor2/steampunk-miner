import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../../authority/authorityState'
import { stateDigest } from '../../authority/stateDigest'
import { planetParamsFor } from '../../world/planetParams'
import { createHazardStrip, sampleHazardStrip } from './hazardStripSampler'
import { createSeededStripGround } from './seededStripGround'
import { digFrameAt, VIEWER_WITH_SCANNER } from './stripFixtures'
import { gapStepsWithin } from './stripSegments'

const SEED = 1
const FRAME_SECONDS = 1 / 60

describe('hazard strip on a planet', () => {
  it.each([20, 100, 1000, 10_000])(
    'digs down planet 30 at %i m/s within the budget, its window covered to the core',
    (speed) => {
      const params = planetParamsFor(SEED, 30)
      const ground = createSeededStripGround(params, createAuthorityState(startOn(30)).world)
      const strip = createHazardStrip()
      const top = params.radiusTiles - 0.5
      const frames = Math.floor((top - params.coreRadiusTiles) / speed / FRAME_SECONDS)
      for (let frame = 0; frame < frames; frame++) {
        const seconds = frame * FRAME_SECONDS
        sampleHazardStrip(strip, ground, {
          ...digFrameAt(seconds, speed, VIEWER_WITH_SCANNER),
          nose: { x: 0.5, y: top - speed * seconds },
        })
        expect(strip.spentUs).toBeLessThanOrEqual(500)
        expect(gapStepsWithin(strip.segments, strip.fromStep, strip.toStep)).toBe(0)
      }
    },
  )

  it('reads the session it samples without changing it: same state, same digest', () => {
    const state = createAuthorityState(startOn(1))
    const digest = stateDigest(state)
    const params = planetParamsFor(SEED, 1)
    const ground = createSeededStripGround(params, state.world)
    const strip = createHazardStrip()
    for (let frame = 0; frame < 30; frame++) {
      sampleHazardStrip(strip, ground, {
        ...digFrameAt(frame * FRAME_SECONDS, 100, VIEWER_WITH_SCANNER),
        nose: { x: 0.5, y: params.radiusTiles - 0.5 - frame },
        collapse: state.collapse,
      })
    }
    expect(stateDigest(state)).toBe(digest)
  })
})

function startOn(planetIndex: number) {
  return { planetIndex, planetSeed: SEED, playerIds: ['p1'] }
}
