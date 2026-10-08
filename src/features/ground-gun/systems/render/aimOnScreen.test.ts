import { describe, expect, it } from 'vitest'
import { isDragAiming, reticleEndOf, rightOfUp, rigAimOfDrag } from './aimOnScreen'

/** An upright rig on an unrolled screen: right is +x, up is -y (screen y runs down). */
const RIGHT = { x: 30, y: 0 }
const UP = { x: 0, y: -30 }

describe('ground-gun: aiming on the screen', () => {
  it('aims only once the drag passes the aim distance', () => {
    expect(isDragAiming({ x: 3, y: 4 }, 5)).toBe(true)
    expect(isDragAiming({ x: 3, y: 3 }, 5)).toBe(false)
  })

  it('reads a drag down-right on an upright rig as along and down in its frame', () => {
    const aim = rigAimOfDrag({ x: 60, y: 30 }, RIGHT, UP)
    expect(aim.along).toBeCloseTo(2)
    expect(aim.down).toBeCloseTo(1)
  })

  it('reads the same drag through a camera rolled a quarter turn as the rig sees it', () => {
    // Rolled: the rig's right now points down the screen and its up to the right.
    const aim = rigAimOfDrag({ x: -30, y: 60 }, { x: 0, y: 30 }, { x: 30, y: 0 })
    expect(aim.along).toBeCloseTo(2)
    expect(aim.down).toBeCloseTo(1)
  })

  it('takes the right-hand tangent of the up as the bore table reads the facing', () => {
    expect(rightOfUp({ x: 0, y: 1 })).toEqual({ x: 1, y: -0 })
  })

  it('ends the reticle the gun reach from the centre along the bearing', () => {
    const centre = { x: 10, y: 20 }
    const east = reticleEndOf(centre, { x: 0, y: 1 }, 255, 4)
    expect(east.x).toBeCloseTo(14)
    expect(east.y).toBeCloseTo(20)
    const west = reticleEndOf(centre, { x: 0, y: 1 }, 0, 4)
    expect(west.x).toBeCloseTo(6)
    const edge = reticleEndOf(centre, { x: 0, y: 1 }, 170, 4)
    expect(Math.hypot(edge.x - 10, edge.y - 20)).toBeCloseTo(4)
    expect(edge.y).toBeLessThan(20)
  })
})
