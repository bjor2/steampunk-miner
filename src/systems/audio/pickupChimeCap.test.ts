import { describe, expect, it } from 'vitest'
import { createPickupChimeCap, offerPickupChime, takeDueChime } from './pickupChimeCap'

/** A pickup of `tier` every frame for `seconds` at `fps`: the chimes that sound. */
function chimesOfStream(fps: number, seconds: number, tierAt: (frame: number) => number) {
  const cap = createPickupChimeCap()
  const chimes: number[] = []
  for (let frame = 0; frame < fps * seconds; frame++) {
    const due = takeDueChime(cap, 1 / fps)
    if (due !== null) chimes.push(due)
    const now = offerPickupChime(cap, tierAt(frame))
    if (now !== null) chimes.push(now)
  }
  return chimes
}

describe('pickup chime cap', () => {
  it('chimes a lone pickup at once', () => {
    expect(offerPickupChime(createPickupChimeCap(), 3)).toBe(3)
  })

  it('sounds at most 12 chimes a second at 30 and 144 frames a second', () => {
    for (const fps of [30, 144]) {
      const chimes = chimesOfStream(fps, 2, () => 1)
      expect(chimes.length).toBeLessThanOrEqual(24)
      expect(chimes.length).toBeGreaterThanOrEqual(fps === 30 ? 15 : 23)
    }
  })

  it('merges held pickups into one chime at the highest tier held', () => {
    const cap = createPickupChimeCap()
    offerPickupChime(cap, 1)
    expect(offerPickupChime(cap, 2)).toBeNull()
    expect(offerPickupChime(cap, 5)).toBeNull()
    expect(offerPickupChime(cap, 1)).toBeNull()
    expect(takeDueChime(cap, 1 / 24)).toBeNull()
    expect(takeDueChime(cap, 1 / 24)).toBe(5)
    expect(takeDueChime(cap, 1)).toBeNull()
  })
})
