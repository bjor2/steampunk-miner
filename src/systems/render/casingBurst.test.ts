import { describe, expect, it } from 'vitest'
import { CASING_BURST_SPRAYS } from '../../constants/scene'
import type { DomainEvent } from '../authority/domainEvent'
import { burstPointOf, createBurstScratch, writeBurstSprays } from './casingBurst'

// CG2 (ticket 830): the ring bursts as a warned block's refill starts, sparks, a cement puff and
// debris thrown from the block's centre outward from the planet, at high priority.

const STARTED: DomainEvent = {
  tick: 160,
  type: 'CollapseStarted',
  block: '0,8#17',
  samplesFilled: 200,
  vehiclesHit: 0,
}

describe('casing burst (ticket 830)', () => {
  it('bursts from the centre of the block a CollapseStarted names', () => {
    expect(burstPointOf(STARTED)).toEqual({ x: 6, y: 266 })
  })

  it('bursts on no other event, nor on a block id it cannot read', () => {
    expect(burstPointOf({ tick: 1, type: 'CollapseCancelled', block: '0,8#17' })).toBeNull()
    expect(burstPointOf({ ...STARTED, block: 'not-a-block' })).toBeNull()
  })

  it('throws sparks, dust and debris at the table counts, outward from the planet, at high priority', () => {
    const sprays = writeBurstSprays(createBurstScratch(), { x: 0, y: 266 })
    expect(sprays.map((spray) => [spray.kind, spray.count])).toEqual([
      ['spark', CASING_BURST_SPRAYS.spark],
      ['dust', CASING_BURST_SPRAYS.dust],
      ['debris', CASING_BURST_SPRAYS.debris],
    ])
    for (const spray of sprays) {
      expect(spray).toMatchObject({ x: 0, y: 266, priority: 'high' })
      expect(spray.dirX).toBeCloseTo(0, 5)
      expect(spray.dirY).toBeCloseTo(1, 5)
    }
  })

  it('reuses its scratch, so a burst allocates nothing', () => {
    const scratch = createBurstScratch()
    expect(writeBurstSprays(scratch, { x: 3, y: 4 })).toBe(scratch)
    expect(scratch[0].dirX).toBeCloseTo(0.6, 5)
  })
})
