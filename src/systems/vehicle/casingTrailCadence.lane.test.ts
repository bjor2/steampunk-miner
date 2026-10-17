import { describe, expect, it } from 'vitest'
import { CASING_RING_LAG_MM } from '../../constants/balance'
import { EMPTY_CASING_TRAIL, followCasingTrail, type CasingTrail } from './casingTrail'

// The VS's casing bar on #514 ("the ring never ahead of the cut") for a rig that cuts back over
// its own trail: forward 8 m, then 4 m back the way it came with the drill still biting (a wall
// graze in its own bore counts as cutting). Points are recorded every half metre it cuts, so the
// way back records new points among the old, the trail passes `MAX_CASING_TRAIL_POINTS` and lays
// its oldest at once, which on the way back sits where the stamp is heading. Red at a report every
// tick at every stride (the ring lands under the stamp); 12-tick reports do it too at slow
// strides (about 1.1 m inside the lag at 1.5 m/s). The fix is a trail rule, an authority change
// the ticket keeps out, so it is raised on #514 and nothing is retuned. A lane: it runs only when
// named and prints the closest ring to the stamp.

const STRIDES_MM = [25, 50, 117, 250]
const FORWARD_MM = 8000
const BACK_MM = 4000

/** The closest any ring is laid to the stamp's centre, cutting forward then back. */
function closestRingMm(strideMm: number, interval: number): number {
  const forward = Array.from({ length: FORWARD_MM / strideMm }, (_, i) => (i + 1) * strideMm)
  const back = Array.from({ length: BACK_MM / strideMm }, (_, i) => FORWARD_MM - (i + 1) * strideMm)
  const reported = [...forward, ...back].filter((_, tick) => (tick + 1) % interval === 0)
  let trail: CasingTrail = EMPTY_CASING_TRAIL
  let closest = Infinity
  for (const x of reported) {
    const step = followCasingTrail(trail, { xMm: x, yMm: 0 }, true)
    trail = step.trail
    for (const point of step.due) closest = Math.min(closest, Math.abs(point.xMm - x))
  }
  return closest
}

describe('casing rings of a rig cutting back over its own trail (#514, lane)', () => {
  for (const strideMm of STRIDES_MM) {
    it(`lays no ring inside the lag at ${strideMm} mm a tick and a report every tick`, () => {
      const closest = {
        everyTick: closestRingMm(strideMm, 1),
        every12: closestRingMm(strideMm, 12),
      }
      console.log(`closest ring to the stamp at ${strideMm} mm a tick: ${JSON.stringify(closest)}`)
      expect(closest.everyTick).toBeGreaterThanOrEqual(CASING_RING_LAG_MM)
    })
  }
})
