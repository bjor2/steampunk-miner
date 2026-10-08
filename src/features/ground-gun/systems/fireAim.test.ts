import { describe, expect, it } from 'vitest'
import { clampedBearing, isBearingInArc } from '../../../systems/authority/bore/boreAim'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import { bearingOfAim, facingBearingOf } from './fireAim'

/** The 60° edges of #313's table: 85 on the left, 170 on the right. */
const LEFT_EDGE = 85
const RIGHT_EDGE = 170

describe('ground-gun: aiming the bore gun (#309 aim amendment)', () => {
  it('fires a tap or a resting stick along the facing, horizontally', () => {
    expect(facingBearingOf(FACING.left)).toBe(0)
    expect(facingBearingOf(FACING.right)).toBe(255)
    expect(bearingOfAim({ along: 0, down: 0 }, FACING.left)).toBe(0)
    expect(bearingOfAim({ along: 0, down: 0 }, FACING.right)).toBe(255)
  })

  it('points a horizontal aim along the horizontal on its side', () => {
    expect(bearingOfAim({ along: 5, down: 0 }, FACING.left)).toBe(255)
    expect(bearingOfAim({ along: -5, down: 0 }, FACING.right)).toBe(0)
  })

  it('keeps an aim inside the arc on the table bearing nearest to it', () => {
    // 30° below horizontal to the right: a quarter of the way from 255 to 127.5.
    const bearing = bearingOfAim({ along: 866, down: 500 }, FACING.right)
    expect(isBearingInArc(bearing)).toBe(true)
    expect(bearing).toBeGreaterThanOrEqual(212)
    expect(bearing).toBeLessThanOrEqual(214)
  })

  it('snaps an aim inside the cone to the 60° edge on the side of its along sign', () => {
    expect(bearingOfAim({ along: 1, down: 100 }, FACING.left)).toBe(RIGHT_EDGE)
    expect(bearingOfAim({ along: -1, down: 100 }, FACING.right)).toBe(LEFT_EDGE)
    // 75° below horizontal, as #309 test 1 asks.
    expect(bearingOfAim({ along: 259, down: 966 }, FACING.left)).toBe(RIGHT_EDGE)
  })

  it('sends exactly straight down to the edge on the facing side', () => {
    expect(bearingOfAim({ along: 0, down: 7 }, FACING.left)).toBe(LEFT_EDGE)
    expect(bearingOfAim({ along: 0, down: 7 }, FACING.right)).toBe(RIGHT_EDGE)
  })

  it('never aims upward: an aim above horizontal lands on the horizontal on its side', () => {
    expect(bearingOfAim({ along: 3, down: -9 }, FACING.left)).toBe(255)
    expect(bearingOfAim({ along: -3, down: -9 }, FACING.right)).toBe(0)
    expect(bearingOfAim({ along: 0, down: -9 }, FACING.left)).toBe(0)
  })

  it('only ever answers a bearing the authority bores as sent', () => {
    for (let along = -10; along <= 10; along++) {
      for (let down = -10; down <= 10; down++) {
        const bearing = bearingOfAim({ along, down }, FACING.right)
        expect(clampedBearing(bearing)).toBe(bearing)
      }
    }
  })
})
