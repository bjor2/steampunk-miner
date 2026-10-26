import { describe, expect, it } from 'vitest'
import { MM_PER_METRE } from '../../../../constants/physics'
import { SHIPPED_ART } from '../../../../scene/shippedArt'
import { bodyHalfMmAt } from '../../../../systems/vehicle/drillBore'
import type { RigWidth } from '../../../../systems/render/bodyWidthLook'
import {
  bodyWidthReadingOf,
  heldMountsOf,
  isMountSeated,
  mountSeatOf,
  mountTraceOf,
} from './heldMountSeats'

/**
 * Every width Mark the drill-gear lane sells (the side cutters 1, their Mark 2 2, Wide's reamers
 * +1: 3), then levels past the shipped Marks up to the TD's 1e6, as the width is uncapped.
 */
const WIDTH_LEVELS = [0, 1, 2, 3, 10, 101, 1_000_000]

const MOUNTS = heldMountsOf(SHIPPED_ART)

/** The rig settled at `widthLevel`: its collider at the width row's half side. */
function rigAt(widthLevel: number): RigWidth {
  return { bodyHalfSide: bodyHalfMmAt(widthLevel) / MM_PER_METRE }
}

describe('held mounts on the widened rig (ticket 666, B3)', () => {
  it('traces the turret at each look, the hitch and the drill head', () => {
    expect(MOUNTS.map((mount) => mount.id)).toEqual([
      'auto_guns.look-1',
      'auto_guns.look-2',
      'auto_guns.look-3',
      'hull.hitch',
      'drill.head',
    ])
  })

  it('seats every mount on the drawn body at every width Mark', () => {
    for (const level of WIDTH_LEVELS) {
      const unseated = MOUNTS.map((mount) => mountSeatOf(mount, rigAt(level))).filter(
        (seat) => !isMountSeated(seat),
      )
      expect(unseated, `width level ${level}`).toEqual([])
    }
  })

  it('keeps every mount trace byte-identical to the bare rig apart from the width', () => {
    const bare = JSON.stringify(mountTraceOf(MOUNTS, rigAt(0)))
    for (const level of WIDTH_LEVELS)
      expect(JSON.stringify(mountTraceOf(MOUNTS, rigAt(level))), `width level ${level}`).toBe(bare)
  })

  it('holds every mounted part at its authored size, position only', () => {
    for (const level of WIDTH_LEVELS)
      for (const seat of mountTraceOf(MOUNTS, rigAt(level))) expect(seat.drawnSizeShare).toBe(1)
  })

  it('keeps the hitch hanging its few centimetres past the stern, the rest on the body', () => {
    const seats = mountTraceOf(MOUNTS, rigAt(3))
    const hitch = seats.find((seat) => seat.id === 'hull.hitch')
    expect(hitch?.bodyShare).toBe(-1)
    expect(hitch?.overhangM).toBeGreaterThan(0)
    for (const seat of seats.filter((one) => one.id !== 'hull.hitch')) {
      expect(seat.overhangM).toBe(0)
      expect(Math.abs(seat.bodyShare)).toBeLessThan(1)
    }
  })

  it('reads a mount hung past the hitch as floating off the body', () => {
    const floating = mountSeatOf({ id: 'stray', x: -0.7 }, rigAt(2))
    expect(isMountSeated(floating)).toBe(false)
  })
})

describe('body width debug read (ticket 666)', () => {
  it('reports the drawn width at the collider and no mount off the body at the widest Mark', () => {
    const rig = rigAt(3)
    const reading = bodyWidthReadingOf(SHIPPED_ART, rig)
    expect(reading.drawnWidth).toBeCloseTo(2 * rig.bodyHalfSide, 9)
    expect(reading.seats).toHaveLength(MOUNTS.length)
    expect(reading.unseatedIds).toEqual([])
  })
})
