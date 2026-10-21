import { describe, expect, it } from 'vitest'
import { casingRingLagMm } from './drillBore'
import { EMPTY_CASING_TRAIL, followCasingTrail, type CasingTrail } from './casingTrail'

// The VS's casing gate on #514 for a rig that cuts back over its own trail (VS amendment, quoted by
// the TD in 6228998595): forward 8 m, then 4 m back the way it came with the drill still biting (a
// wall graze in its own bore counts as cutting).
// - No ring inside the lag, hard at a report every tick and at 12. It was known red under #538
//   until #538's spacing rule landed; the marker was deleted with it, as its expiry said.
// - Ratchet, hard: no more rings laid inside the lag at a report every tick than at 12 (VS: a
//   faster pose rate must not make the overflow fire more often).
// Straight legs are gated in `authority/casingCadence.test.ts`. A lane: it runs only when named
// and prints the closest ring and the rings inside the lag at both cadences.

const STRIDES_MM = [25, 50, 117, 250]
const FORWARD_MM = 8000
const BACK_MM = 4000

/** The rings laid cutting forward then back: the closest to the stamp, and those inside the lag. */
interface ReversalRings {
  closestMm: number
  overflowRings: number
}

function reversalRingsAt(strideMm: number, interval: number): ReversalRings {
  let trail: CasingTrail = EMPTY_CASING_TRAIL
  let rings: ReversalRings = { closestMm: Infinity, overflowRings: 0 }
  for (const x of reportedCentresOf(strideMm, interval)) {
    const step = followCasingTrail(trail, { xMm: x, yMm: 0 }, true)
    trail = step.trail
    rings = step.due.reduce((sum, point) => withRing(sum, Math.abs(point.xMm - x)), rings)
  }
  return rings
}

/** The stamp centres reported every `interval` ticks along the forward-then-back cut. */
function reportedCentresOf(strideMm: number, interval: number): number[] {
  const forward = Array.from({ length: FORWARD_MM / strideMm }, (_, i) => (i + 1) * strideMm)
  const back = Array.from({ length: BACK_MM / strideMm }, (_, i) => FORWARD_MM - (i + 1) * strideMm)
  return [...forward, ...back].filter((_, tick) => (tick + 1) % interval === 0)
}

function withRing(rings: ReversalRings, distanceMm: number): ReversalRings {
  return {
    closestMm: Math.min(rings.closestMm, distanceMm),
    overflowRings: rings.overflowRings + (distanceMm < casingRingLagMm() ? 1 : 0),
  }
}

function ringsAtBothCadences(strideMm: number) {
  const rings = { everyTick: reversalRingsAt(strideMm, 1), every12: reversalRingsAt(strideMm, 12) }
  console.log(`rings cutting back at ${strideMm} mm a tick: ${JSON.stringify(rings)}`)
  return rings
}

describe('casing rings of a rig cutting back over its own trail (#514, lane)', () => {
  for (const strideMm of STRIDES_MM) {
    it(`lays no ring inside the lag at either cadence, ${strideMm} mm a tick`, () => {
      const { everyTick, every12 } = ringsAtBothCadences(strideMm)
      expect(everyTick.closestMm).toBeGreaterThanOrEqual(casingRingLagMm())
      expect(every12.closestMm).toBeGreaterThanOrEqual(casingRingLagMm())
    })

    it(`lays no more rings inside the lag than 12-tick reports, ${strideMm} mm a tick`, () => {
      const { everyTick, every12 } = ringsAtBothCadences(strideMm)
      expect(everyTick.overflowRings).toBeLessThanOrEqual(every12.overflowRings)
    })
  }
})
