import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CASING_RING_LAG_MM } from '../../constants/balance'
import type { KnownRedMarker } from '../../constants/knownRed'
import { EMPTY_CASING_TRAIL, followCasingTrail, type CasingTrail } from './casingTrail'

// The VS's casing gate on #514 for a rig that cuts back over its own trail (VS amendment, quoted by
// the TD in 6228998595): forward 8 m, then 4 m back the way it came with the drill still biting (a
// wall graze in its own bore counts as cutting). Points are recorded every half metre it cuts, so
// the way back records new points among the old, the trail passes `MAX_CASING_TRAIL_POINTS` and
// lays its oldest at once, which on the way back sits where the stamp is heading.
// - "No ring inside the lag" is known red under #538 (the trail-rule overflow, an authority change
//   #514 keeps out): main at 12-tick reports already lays rings inside the lag at slow strides.
//   The marker expires when #538 closes, and fails once the bar is green while it is still set.
// - Ratchets, hard: the closest ring at a report every tick no closer than at 12-tick reports, and
//   no more rings laid by the overflow (inside the lag) than at 12. If either is red, #538 becomes
//   a prerequisite of #514's merge (VS).
// Straight legs are gated in `authority/casingCadence.test.ts`. A lane: it runs only when named
// and prints the closest ring and the overflow-laid rings at both cadences.

const STRIDES_MM = [25, 50, 117, 250]
const FORWARD_MM = 8000
const BACK_MM = 4000
const REVERSAL_KNOWN_RED: KnownRedMarker = {
  finding: 538,
  reason:
    'the casing trail overflows its points and lays rings inside the lag on a rig cutting back',
}

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
    overflowRings: rings.overflowRings + (distanceMm < CASING_RING_LAG_MM ? 1 : 0),
  }
}

function ringsAtBothCadences(strideMm: number) {
  const rings = { everyTick: reversalRingsAt(strideMm, 1), every12: reversalRingsAt(strideMm, 12) }
  console.log(`rings cutting back at ${strideMm} mm a tick: ${JSON.stringify(rings)}`)
  return rings
}

/** The loop writes the finding's metrics file when it closes it (ticket 419), with `closed`. */
function isFindingOpen(finding: number): boolean {
  const url = new URL(`../../../docs/metrics/tickets/${finding}.json`, import.meta.url)
  if (!existsSync(url)) return true
  return (
    ((JSON.parse(readFileSync(url, 'utf8')) as { closed?: string | null }).closed ?? null) === null
  )
}

describe('casing rings of a rig cutting back over its own trail (#514, lane)', () => {
  it('lays no ring inside the lag at a report every tick, or is known red under #538', () => {
    const inside = STRIDES_MM.filter(
      (strideMm) => reversalRingsAt(strideMm, 1).closestMm < CASING_RING_LAG_MM,
    )
    const marker = REVERSAL_KNOWN_RED
    console.log(`known red (#${marker.finding}, ${marker.reason}): strides ${inside.join(', ')} mm`)
    expect(isFindingOpen(marker.finding), `#${marker.finding} closed: delete the marker`).toBe(true)
    expect(inside.length, `green: delete the #${marker.finding} marker`).toBeGreaterThan(0)
  })

  for (const strideMm of STRIDES_MM) {
    it(`lays no ring closer to the stamp than 12-tick reports, ${strideMm} mm a tick`, () => {
      const { everyTick, every12 } = ringsAtBothCadences(strideMm)
      expect(everyTick.closestMm).toBeGreaterThanOrEqual(every12.closestMm)
    })

    it(`lays no more rings by the overflow than 12-tick reports, ${strideMm} mm a tick`, () => {
      const { everyTick, every12 } = ringsAtBothCadences(strideMm)
      expect(everyTick.overflowRings).toBeLessThanOrEqual(every12.overflowRings)
    })
  }
})
