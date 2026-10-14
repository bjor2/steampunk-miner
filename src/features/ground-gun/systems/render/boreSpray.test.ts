import { describe, expect, it } from 'vitest'
import { createSprayScratch, writeCellSpray, writeMuzzleSpray } from './boreSpray'

const RIG = { x: -29.5, y: 280.5 }
const UP = { x: 0, y: 1 }
const EAST_BEARING = 255

describe('ground-gun: the tracer spray', () => {
  it('throws the shot sparks from the rig along its bearing', () => {
    const spray = writeMuzzleSpray(createSprayScratch(), RIG, UP, EAST_BEARING, 6)
    expect(spray).toMatchObject({ kind: 'spark', x: RIG.x, y: RIG.y, count: 6, priority: 'low' })
    expect(spray.dirX).toBeCloseTo(1, 5)
    expect(spray.dirY).toBeCloseTo(0, 5)
  })

  it('throws a cell from its centre, onward from the rig that bored it', () => {
    const spray = writeCellSpray(createSprayScratch(), 'debris', -27, 280, RIG, 3)
    expect(spray).toMatchObject({ kind: 'debris', x: -26.5, y: 280.5, count: 3, priority: 'low' })
    expect(spray.dirX).toBeCloseTo(1, 5)
    expect(spray.dirY).toBeCloseTo(0, 5)
  })

  it('asks every piece at low priority, so the pool drops tracer before a blast', () => {
    const scratch = createSprayScratch()
    expect(writeCellSpray(scratch, 'dust', 0, 0, RIG, 2).priority).toBe('low')
    expect(writeMuzzleSpray(scratch, RIG, UP, 0, 6).priority).toBe('low')
  })
})
