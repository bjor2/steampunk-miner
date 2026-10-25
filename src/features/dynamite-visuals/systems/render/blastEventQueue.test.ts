import { describe, expect, it } from 'vitest'
import type { DomainEvent } from '../../../../systems/authority/domainEvent'
import {
  clearBlastEventQueue,
  createBlastEventQueue,
  queueBlastEvents,
  queueFalls,
  type BlastQueueAnswers,
} from './blastEventQueue'

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

const started = (size: number, blastSeq = 1): DomainEvent => ({
  type: 'BlastStarted',
  tick: 10,
  tx: 4,
  ty: 200,
  size,
  chargeType: size <= 4 ? 1 : 2,
  radiusLevel: 0,
  baseR2: '1',
  groundR2: '1',
  blastSeq,
  casingLaid: false,
})

/** Answers that record what they were asked, so the order of asking is checked. */
function recordingAnswers(showcaseSizes: number[] = []) {
  const asked: string[] = []
  const answers: BlastQueueAnswers = {
    seedOf: (blastSeq) => 1000 + blastSeq,
    groundColourOf: (tx, ty) => [tx / 10, ty / 1000, 0.5],
    isShowcaseOf: (size) => {
      asked.push(`showcase ${size}`)
      return showcaseSizes.includes(size)
    },
    noticePurchase: (size) => {
      asked.push(`bought ${size}`)
    },
  }
  return { answers, asked }
}

describe('blast event queue', () => {
  it('keeps the fronts and the blasts of a batch and nothing else, each blast with its seed, ground colour and radius', () => {
    const queue = createBlastEventQueue(4)
    const { answers } = recordingAnswers()
    queueBlastEvents(
      queue,
      [
        detonated(5, 8000),
        started(5, 7),
        front(2000),
        { type: 'PlanetEntered', tick: 0, planetSeed: 1, generatorVersion: 4, radius: 300 },
      ],
      answers,
    )
    expect(queue.fronts.slice(0, queue.frontCount)).toEqual([
      { tx: 4, ty: 200, rInnerMm: 0, rOuterMm: 2000 },
    ])
    expect(queue.blasts.slice(0, queue.blastCount)).toEqual([
      {
        tx: 4,
        ty: 200,
        size: 5,
        chargeType: 2,
        radiusLevel: 0,
        blastSeq: 7,
        tick: 10,
        groundRadiusMm: 8000,
        casingLaid: false,
        seed: 1007,
        isShowcase: false,
        groundColour: [0.4, 0.2, 0.5],
      },
    ])
  })

  it("takes a blast's ground radius from the detonation said beside it, else from the kernel ladder", () => {
    const queue = createBlastEventQueue(2)
    const { answers } = recordingAnswers()
    queueBlastEvents(queue, [detonated(10, 30000), started(10)], answers)
    expect(queue.blasts[0].groundRadiusMm).toBe(30000)
    clearBlastEventQueue(queue)
    queueBlastEvents(queue, [started(10)], answers)
    expect(queue.blasts[0].groundRadiusMm).toBe(24000)
  })

  it('tells the answers of each purchase and asks each blast its showcase, in event order', () => {
    const queue = createBlastEventQueue(4)
    const { answers, asked } = recordingAnswers([3])
    queueBlastEvents(
      queue,
      [
        { type: 'ChargesRestocked', tick: 1, size: 3, count: 2, price: '10' },
        detonated(3),
        started(3),
        started(1, 2),
      ],
      answers,
    )
    expect(asked).toEqual(['bought 3', 'showcase 3', 'showcase 1'])
    expect(queue.blasts.slice(0, 2).map((blast) => blast.isShowcase)).toEqual([true, false])
  })

  it('drops what a batch holds past its capacity and starts over once cleared', () => {
    const queue = createBlastEventQueue(2)
    const { answers } = recordingAnswers()
    queueBlastEvents(queue, [front(1000), front(2000), front(3000)], answers)
    expect(queue.frontCount).toBe(2)
    expect(queue.fronts[1].rOuterMm).toBe(2000)
    clearBlastEventQueue(queue)
    queueBlastEvents(queue, [front(4000)], answers)
    expect(queue.frontCount).toBe(1)
    expect(queue.fronts[0].rOuterMm).toBe(4000)
  })

  it('queues the falls the feed found, to its own capacity', () => {
    const queue = createBlastEventQueue(4, 1)
    queueFalls(queue, [
      { x0: 4, y0: 8, sizeM: 4 },
      { x0: 8, y0: 8, sizeM: 4 },
    ])
    expect(queue.fallCount).toBe(1)
    expect(queue.falls[0]).toEqual({ x0: 4, y0: 8, sizeM: 4 })
    clearBlastEventQueue(queue)
    expect(queue.fallCount).toBe(0)
  })
})
