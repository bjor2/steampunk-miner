import { describe, expect, it } from 'vitest'
import type { ForkTurntableRequest } from '../../../tech-tree'
import { RESTING_TURN, SHOWCASE, turnTowardTrack } from './showcaseReactions'
import { beatOfRequest, isBeatPlaying, showcaseTurnRadiansAt } from './turntableBeat'

const { turnTicks, beatHoldTicks } = SHOWCASE

function requestAt(tick: number, faceTurnRadians = 0.5): ForkTurntableRequest {
  return { lane: 'drill-gear', branch: 'deep', attachId: 'drill.fork', faceTurnRadians, tick }
}

describe('workshop turntable beat (ticket 270)', () => {
  it("eases the part to the camera, holds it G&V's 24 ticks, then hands the turn back", () => {
    const beat = beatOfRequest(RESTING_TURN, null, requestAt(100))
    const at = (tick: number) => showcaseTurnRadiansAt(RESTING_TURN, beat, tick)

    expect(beatHoldTicks).toBe(24)
    expect(at(100)).toBe(0)
    expect(at(100 + turnTicks / 2)).toBeGreaterThan(0)
    expect(at(100 + turnTicks / 2)).toBeLessThan(0.5)
    expect(at(100 + turnTicks)).toBe(0.5)
    expect(at(100 + turnTicks + beatHoldTicks - 1)).toBe(0.5)
    expect(at(100 + 1.5 * turnTicks + beatHoldTicks)).toBeLessThan(0.5)
    expect(at(100 + 2 * turnTicks + beatHoldTicks)).toBe(0)
    expect(isBeatPlaying(beat, 100 + 2 * turnTicks + beatHoldTicks)).toBe(false)
  })

  it('hands back to the selected track, and starts from wherever the turntable stood', () => {
    const toCargo = turnTowardTrack(RESTING_TURN, 'cargo_hold', 0)
    const beat = beatOfRequest(toCargo, null, requestAt(10))
    const cargoTurn = SHOWCASE.tracks.cargo_hold.faceTurnRadians
    const end = 10 + 2 * turnTicks + beatHoldTicks

    expect(beat.fromRadians).toBe(showcaseTurnRadiansAt(toCargo, null, 10))
    expect(showcaseTurnRadiansAt(toCargo, beat, end)).toBe(cargoTurn)
  })
})
