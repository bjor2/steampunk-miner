import { describe, expect, it } from 'vitest'
import type { FeedbackCue } from '../feedback/feedbackCues'
import { SHIPPED_CHARGE_BLAST_KICK } from '../registries/chargeBlastCue'
import { createDelayedThumps, delayThump, takeDueThumps, thumpDelayTicksOf } from './delayedThumps'

const blastWaiting = (thumpDelayTicks: number): FeedbackCue => ({
  kind: 'chargeBlast',
  kick: { shake: 0.8, flash: 0, thumpDelayTicks },
})

/** The seconds after which a thump delayed `ticks` sounds, stepping frames of `1 / fps`. */
function secondsUntilThump(ticks: number, fps: number): number {
  const thumps = createDelayedThumps()
  delayThump(thumps, ticks)
  for (let frame = 1; frame <= fps * 2; frame++) {
    if (takeDueThumps(thumps, 1 / fps) > 0) return frame / fps
  }
  return Number.POSITIVE_INFINITY
}

describe('delayed thumps', () => {
  it("sounds the shipped charge's blast at once, as it always has", () => {
    expect(thumpDelayTicksOf({ kind: 'chargeBlast', kick: SHIPPED_CHARGE_BLAST_KICK })).toBe(0)
  })

  it('sounds every other cue at once', () => {
    expect(thumpDelayTicksOf({ kind: 'collapseCrash' })).toBe(0)
  })

  it("waits the ticks the blast's kick asks for", () => {
    expect(thumpDelayTicksOf(blastWaiting(30))).toBe(30)
  })

  it('sounds a 30-tick thump half a second later at 30 and at 144 frames/s', () => {
    for (const fps of [30, 144]) {
      expect(secondsUntilThump(30, fps)).toBeGreaterThanOrEqual(0.5 - 1e-9)
      expect(secondsUntilThump(30, fps)).toBeLessThanOrEqual(0.5 + 1 / fps)
    }
  })

  it('sounds each queued thump once, in the frame it comes due', () => {
    const thumps = createDelayedThumps()
    delayThump(thumps, 6)
    delayThump(thumps, 12)
    delayThump(thumps, 6)
    expect(takeDueThumps(thumps, 0.05)).toBe(0)
    expect(takeDueThumps(thumps, 0.06)).toBe(2)
    expect(takeDueThumps(thumps, 0.1)).toBe(1)
    expect(takeDueThumps(thumps, 1)).toBe(0)
  })
})
