import { describe, expect, it } from 'vitest'
import {
  CASING_RING_LAG_MM,
  CASING_RING_SPACING_MM,
  MAX_CASING_TRAIL_POINTS,
} from '../../constants/balance'
import {
  EMPTY_CASING_TRAIL,
  followCasingTrail,
  followCasingTrailAlongCut,
  type CasingTrail,
  type RingPoint,
  type TrailStep,
} from './casingTrail'

// A rig cutting back over its own trail (ticket 538, the TD ruling 6228998310 on #538): forward
// 8 m, then 4 m back the way it came with the drill still biting (a wall graze in its own bore
// counts as cutting), its stamp centre reported every tick or every 12. Both trail functions, the
// pose report's and the swept cut's, lay no ring under the stamp or inside the lag on either leg,
// and never hold more than `MAX_CASING_TRAIL_POINTS`. A ring the lag rule lays as the rig turns
// lies the full lag from the stamp, maybe on the side it now heads to: the lag rule is unchanged,
// and a heading guard belongs to the two-phase ring, its own ticket (the ruling's out of scope).
// The session-level check, with the lining bill, is `authority/casingReversal.test.ts`.

const STRIDES_MM = [25, 50, 117, 250]
const INTERVALS = [1, 12]
const FORWARD_MM = 8000
const BACK_MM = 4000

/** The stamp centres' x reported every `interval` ticks along the forward-then-back cut. */
function reportedCentresOf(strideMm: number, interval: number): number[] {
  const forward = Array.from({ length: FORWARD_MM / strideMm }, (_, i) => (i + 1) * strideMm)
  const back = Array.from(
    { length: Math.floor(BACK_MM / strideMm) },
    (_, i) => FORWARD_MM - (i + 1) * strideMm,
  )
  return [...forward, ...back].filter((_, tick) => (tick + 1) % interval === 0)
}

/** How far from the stamp each ring was laid, and the most points the trail held waiting. */
interface ReversalRun {
  ringDistancesMm: number[]
  mostWaiting: number
}

type FollowTrail = (trail: CasingTrail, from: RingPoint, to: RingPoint) => TrailStep

const byPoseReport: FollowTrail = (trail, _from, to) => followCasingTrail(trail, to, true)
const bySweptCut: FollowTrail = (trail, from, to) =>
  followCasingTrailAlongCut(trail, { from, to }, true)

function cutForwardAndBack(follow: FollowTrail, strideMm: number, interval: number): ReversalRun {
  let trail: CasingTrail = EMPTY_CASING_TRAIL
  let from: RingPoint = { xMm: 0, yMm: 0 }
  const run: ReversalRun = { ringDistancesMm: [], mostWaiting: 0 }
  for (const x of reportedCentresOf(strideMm, interval)) {
    const to = at(x, 0)
    const step = follow(trail, from, to)
    run.ringDistancesMm.push(...step.due.map((point) => Math.abs(point.xMm - x)))
    run.mostWaiting = Math.max(run.mostWaiting, step.trail.unlined.length)
    trail = step.trail
    from = to
  }
  return run
}

const FOLLOWERS: [string, FollowTrail][] = [
  ['pose report', byPoseReport],
  ['swept cut', bySweptCut],
]

describe('casing trail of a rig cutting back over its own trail (#538)', () => {
  for (const [name, follow] of FOLLOWERS) {
    for (const interval of INTERVALS) {
      for (const strideMm of STRIDES_MM) {
        const cadence = `${name}, ${strideMm} mm a tick, reported every ${interval}`
        it(`lays no ring under the stamp or inside the lag, ${cadence}`, () => {
          const { ringDistancesMm } = cutForwardAndBack(follow, strideMm, interval)
          expect(ringDistancesMm.length).toBeGreaterThan(0)
          expect(ringDistancesMm.filter((mm) => mm < CASING_RING_LAG_MM)).toEqual([])
        })

        it(`holds no more than the cap of waiting points, ${cadence}`, () => {
          const { mostWaiting } = cutForwardAndBack(follow, strideMm, interval)
          expect(mostWaiting).toBeLessThanOrEqual(MAX_CASING_TRAIL_POINTS)
        })
      }
    }
  }

  it('holds a point every half metre of the 2.15 m lag behind a straight cut, well under the cap', () => {
    let trail: CasingTrail = EMPTY_CASING_TRAIL
    for (let x = 0; x <= FORWARD_MM; x += 25) trail = followCasingTrail(trail, at(x, 0), true).trail
    expect(trail.unlined).toHaveLength(Math.floor(CASING_RING_LAG_MM / CASING_RING_SPACING_MM) + 1)
  })
})

function at(xMm: number, yMm: number): RingPoint {
  return { xMm, yMm }
}

/** A stamp circling `turns` times round a 1 m circle: every point of it lies within the lag. */
function circleCentres(turns: number): RingPoint[] {
  const steps = 72
  return Array.from({ length: steps * turns + 1 }, (_, index) => {
    const angle = (2 * Math.PI * index) / steps
    return at(Math.round(1000 * Math.cos(angle)), Math.round(1000 * Math.sin(angle)))
  })
}

describe('casing trail of a rig looping inside its own lag (#538)', () => {
  for (const [name, follow] of FOLLOWERS) {
    it(`drops the newest points past the cap and lays nothing inside the lag, ${name}`, () => {
      let trail: CasingTrail = EMPTY_CASING_TRAIL
      let from = at(1000, 0)
      const laid: RingPoint[] = []
      for (const to of circleCentres(3)) {
        const step = follow(trail, from, to)
        laid.push(...step.due)
        expect(step.trail.unlined.length).toBeLessThanOrEqual(MAX_CASING_TRAIL_POINTS)
        trail = step.trail
        from = to
      }
      expect(laid).toEqual([])
      expect(trail.unlined.length).toBeGreaterThan(CASING_RING_LAG_MM / CASING_RING_SPACING_MM)
    })
  }

  it('keeps the oldest waiting points when the cap drops, so the trail behind still lines', () => {
    let trail: CasingTrail = EMPTY_CASING_TRAIL
    for (const to of circleCentres(3)) trail = followCasingTrail(trail, to, true).trail
    const oldest = trail.unlined[0]
    const away = followCasingTrail(trail, at(5000, 0), false)
    expect(oldest).toMatchObject({ xMm: 1000, yMm: 0 })
    expect(away.due).toEqual(trail.unlined)
  })
})
