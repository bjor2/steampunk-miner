import { describe, expect, it } from 'vitest'
import {
  forwardOfRigPoint,
  HOLD_ANCHOR,
  noseReachOf,
  planePointOf,
  popRigPointAt,
  popStartOf,
  type RigFrame,
  type RigPoint,
} from './popFlight'

// Where a pop flies (G&V bars on #442): from its cell's centre to the hold anchor, both in the
// rig's frame, never ahead of the nose, landing in the hold even at 84 m/s.

const LIFE = 0.4

/** A rig drilling down at (x, y): local up is +y, the nose tile is the one below. */
function rigDrillingDownAt(x: number, y: number): RigFrame {
  return { x, y, up: { x: 0, y: 1 }, ahead: { x: 0, y: -1 }, nose: { x, y: y - 1 } }
}

/** A rig drilling right on a planet side where local up is +x. */
function rigDrillingAlongAt(x: number, y: number): RigFrame {
  return { x, y, up: { x: 1, y: 0 }, ahead: { x: 0, y: -1 }, nose: { x, y: y - 1 } }
}

function point(): RigPoint {
  return { along: 0, upward: 0 }
}

describe('material pop flight', () => {
  it('starts at the cell’s centre in the rig’s frame', () => {
    const rig = rigDrillingDownAt(10.5, 20.5)
    const start = popStartOf(11, 19, rig, point())
    expect(planePointOf(rig, start, { x: 0, y: 0 })).toEqual({ x: 11.5, y: 19.5 })
  })

  it('pulls a start ahead of the nose back to the nose', () => {
    const rig = rigDrillingDownAt(10.5, 20.5)
    const start = popStartOf(10, 17, rig, point())
    expect(forwardOfRigPoint(rig, start)).toBeCloseTo(noseReachOf(rig), 9)
  })

  it('reads the rig’s frame on a tilted planet side the same way', () => {
    const rig = rigDrillingAlongAt(4.5, 4.5)
    const start = popStartOf(4, 3, rig, point())
    expect(planePointOf(rig, start, { x: 0, y: 0 })).toEqual({ x: 4.5, y: 3.5 })
  })

  it('lands on the hold anchor at the end of its flight', () => {
    const end = popRigPointAt({ along: 0.4, upward: -1 }, LIFE, LIFE, point())
    expect(end.along).toBeCloseTo(HOLD_ANCHOR.along, 9)
    expect(end.upward).toBeCloseTo(HOLD_ANCHOR.upward, 9)
  })

  it('keeps every point of the flight behind the nose, travelling back up the rig', () => {
    const rig = rigDrillingDownAt(0.5, 0.5)
    const start = popStartOf(0, -1, rig, point())
    let lastForward = forwardOfRigPoint(rig, start)
    for (let age = 0; age <= LIFE; age += LIFE / 20) {
      const forward = forwardOfRigPoint(rig, popRigPointAt(start, age, LIFE, point()))
      expect(forward).toBeLessThanOrEqual(noseReachOf(rig) + 1e-9)
      expect(forward).toBeLessThanOrEqual(lastForward + 1e-9)
      lastForward = forward
    }
  })

  it('lands in the hold of a rig that drilled on at 84 m/s while it flew', () => {
    const start = popStartOf(0, -1, rigDrillingDownAt(0.5, 0.5), point())
    const rig = rigDrillingDownAt(0.5, 0.5 - 84 * LIFE)
    const landed = planePointOf(rig, popRigPointAt(start, LIFE, LIFE, point()), { x: 0, y: 0 })
    const hold = planePointOf(rig, HOLD_ANCHOR, { x: 0, y: 0 })
    expect(Math.hypot(landed.x - hold.x, landed.y - hold.y)).toBeLessThan(1e-6)
  })
})
