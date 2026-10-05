import { describe, expect, it } from 'vitest'
import { FACING } from '../vehicle/vehiclePose'
import { writeHeadlampDirection } from './headlamp'

function directionOf(up: { x: number; y: number }, facing: (typeof FACING)[keyof typeof FACING]) {
  const out = { x: 0, y: 0 }
  writeHeadlampDirection(up, facing, out)
  // Adding zero turns a signed -0 into 0, so directions compare by value.
  return { x: out.x + 0, y: out.y + 0 }
}

describe('headlamp', () => {
  it('points right along the surface on top of the planet', () => {
    expect(directionOf({ x: 0, y: 1 }, FACING.right)).toEqual({ x: 1, y: 0 })
  })

  it('points toward the core when the drill faces down, wherever the vehicle is', () => {
    expect(directionOf({ x: 1, y: 0 }, FACING.down)).toEqual({ x: -1, y: 0 })
    expect(directionOf({ x: 0, y: -1 }, FACING.down)).toEqual({ x: 0, y: 1 })
  })

  it('points away from the core when the drill faces up', () => {
    expect(directionOf({ x: -1, y: 0 }, FACING.up)).toEqual({ x: -1, y: 0 })
  })
})
