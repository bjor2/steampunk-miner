import { describe, expect, it } from 'vitest'
import type { DomainEvent } from '../../../../systems/authority/domainEvent'
import { clearBlastEventQueue, createBlastEventQueue, queueBlastEvents } from './blastEventQueue'

const front = (rOuterMm: number): DomainEvent => ({
  type: 'BlastFront',
  tick: 10,
  tx: 4,
  ty: 200,
  rInnerMm: 0,
  rOuterMm,
})

const detonated = (size: number, radiusMm?: number): DomainEvent => ({
  type: 'ChargeDetonated',
  tick: 10,
  tx: 4,
  ty: 200,
  size,
  ...(radiusMm === undefined ? {} : { radiusMm }),
  by: 'fuse',
})

describe('blast event queue', () => {
  it('keeps the fronts and detonations of a batch and nothing else', () => {
    const queue = createBlastEventQueue(4)
    queueBlastEvents(queue, [
      detonated(5, 8000),
      front(2000),
      { type: 'PlanetEntered', tick: 0, planetSeed: 1, generatorVersion: 4, radius: 300 },
    ])
    expect(queue.fronts.slice(0, queue.frontCount)).toEqual([
      { tx: 4, ty: 200, rInnerMm: 0, rOuterMm: 2000 },
    ])
    expect(queue.flashes.slice(0, queue.flashCount)).toEqual([
      { tx: 4, ty: 200, size: 5, radiusMm: 8000 },
    ])
  })

  it("takes a detonation's radius from the kernel ladder when it carries none", () => {
    const queue = createBlastEventQueue(1)
    queueBlastEvents(queue, [detonated(10)])
    expect(queue.flashes[0].radiusMm).toBe(24000)
  })

  it('drops what a batch holds past its capacity and starts over once cleared', () => {
    const queue = createBlastEventQueue(2)
    queueBlastEvents(queue, [front(1000), front(2000), front(3000)])
    expect(queue.frontCount).toBe(2)
    expect(queue.fronts[1].rOuterMm).toBe(2000)
    clearBlastEventQueue(queue)
    queueBlastEvents(queue, [front(4000)])
    expect(queue.frontCount).toBe(1)
    expect(queue.fronts[0].rOuterMm).toBe(4000)
  })
})
