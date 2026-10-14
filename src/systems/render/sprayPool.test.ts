import { describe, expect, it } from 'vitest'
import { SPRAY_CAPACITY, SPRAY_LOOKS, SPRAY_LOW_PRIORITY_MOST } from '../../constants/spray'
import {
  admitSpray,
  createSprayPool,
  kindAt,
  pieceSizeAt,
  stepSprayPool,
  type SprayPool,
  type SprayRequest,
  type SprayTally,
} from './sprayPool'

// The kernel spray pool of the TD lock on #314 (section 4): a fixed pool, a capped low-priority
// share, tracer dropped first when a blast needs the room, overflow dropped and counted.

const AT_ZERO = { x: 0, y: 0 }
/** Past every spark's life (0.35 s at most), short of any dust's (0.54 s at least). */
const SPARKS_GONE_SECONDS = 0.4

function request(overrides: Partial<SprayRequest> = {}): SprayRequest {
  return { kind: 'debris', x: 0, y: 0, dirX: 0, dirY: 1, count: 1, priority: 'high', ...overrides }
}

function freshTally(): SprayTally {
  return { requested: 0, dropped: 0, evicted: 0 }
}

function lowPiecesIn(pool: SprayPool): number {
  let low = 0
  for (let at = 0; at < pool.particles.count; at++) low += pool.isLow[at]
  return low
}

function stepFor(pool: SprayPool, seconds: number, stepsPerSecond: number): void {
  const steps = Math.round(seconds * stepsPerSecond)
  for (let step = 0; step < steps; step++) stepSprayPool(pool, 1 / stepsPerSecond)
}

describe('spray pool', () => {
  it('holds the debris pool dynamite-visuals had, 96 pieces, half of them for low priority', () => {
    expect(SPRAY_CAPACITY).toBe(96)
    expect(SPRAY_LOW_PRIORITY_MOST).toBe(48)
    expect(createSprayPool().particles.capacity).toBe(96)
  })

  it('throws every piece a request asks for while it has room', () => {
    const pool = createSprayPool()
    const tally = freshTally()
    admitSpray(pool, request({ count: 30 }), AT_ZERO, tally)
    expect(pool.particles.count).toBe(30)
    expect(tally).toEqual({ requested: 30, dropped: 0, evicted: 0 })
  })

  it('places pieces measured from the origin it is given', () => {
    const pool = createSprayPool()
    admitSpray(pool, request({ x: 1005, y: -40 }), { x: 1000, y: -42 }, freshTally())
    expect(pool.particles.x[0]).toBe(5)
    expect(pool.particles.y[0]).toBe(2)
  })

  it('keeps each piece’s kind and flies it with that kind’s look', () => {
    const pool = createSprayPool()
    admitSpray(pool, request({ kind: 'spark', count: 2 }), AT_ZERO, freshTally())
    admitSpray(pool, request({ kind: 'dust', count: 1 }), AT_ZERO, freshTally())
    expect([0, 1, 2].map((at) => kindAt(pool, at))).toEqual(['spark', 'spark', 'dust'])
    expect(pool.particles.life[0]).toBeLessThanOrEqual(SPRAY_LOOKS.spark.lifeSeconds)
    expect(pieceSizeAt(pool, 2)).toBe(SPRAY_LOOKS.dust.sizeM)
  })

  it('fills at most the low-priority share with low requests and counts the rest dropped', () => {
    const pool = createSprayPool()
    const tally = freshTally()
    admitSpray(pool, request({ priority: 'low', count: 40 }), AT_ZERO, tally)
    admitSpray(pool, request({ priority: 'low', count: 40 }), AT_ZERO, tally)
    expect(pool.particles.count).toBe(SPRAY_LOW_PRIORITY_MOST)
    expect(tally).toEqual({ requested: 80, dropped: 80 - SPRAY_LOW_PRIORITY_MOST, evicted: 0 })
  })

  it('throws a full blast while the tracer holds its share: tracer drops first, never the blast', () => {
    const pool = createSprayPool()
    const tally = freshTally()
    admitSpray(pool, request({ priority: 'low', count: SPRAY_LOW_PRIORITY_MOST }), AT_ZERO, tally)
    admitSpray(pool, request({ count: SPRAY_CAPACITY }), AT_ZERO, tally)
    expect(pool.particles.count).toBe(SPRAY_CAPACITY)
    expect(lowPiecesIn(pool)).toBe(0)
    expect(tally.evicted).toBe(SPRAY_LOW_PRIORITY_MOST)
    expect(tally.dropped).toBe(0)
  })

  it('evicts only as many tracer pieces as the blast needs room for', () => {
    const pool = createSprayPool()
    const tally = freshTally()
    admitSpray(pool, request({ count: 60 }), AT_ZERO, tally)
    admitSpray(pool, request({ priority: 'low', count: 30 }), AT_ZERO, tally)
    admitSpray(pool, request({ count: 10 }), AT_ZERO, tally)
    expect(pool.particles.count).toBe(SPRAY_CAPACITY)
    expect(lowPiecesIn(pool)).toBe(26)
    expect(pool.lowCount).toBe(26)
    expect(tally.evicted).toBe(4)
  })

  it('drops and counts what a full pool of blast pieces has no room for', () => {
    const pool = createSprayPool()
    const tally = freshTally()
    admitSpray(pool, request({ count: SPRAY_CAPACITY }), AT_ZERO, tally)
    admitSpray(pool, request({ count: 5 }), AT_ZERO, tally)
    admitSpray(pool, request({ priority: 'low', count: 3 }), AT_ZERO, tally)
    expect(pool.particles.count).toBe(SPRAY_CAPACITY)
    expect(tally).toEqual({ requested: SPRAY_CAPACITY + 8, dropped: 8, evicted: 0 })
  })

  it('frees a burnt-out piece’s seat, low share included, the same at 30 and 144 steps per second', () => {
    for (const stepsPerSecond of [30, 144]) {
      const pool = createSprayPool()
      admitSpray(
        pool,
        request({ kind: 'spark', priority: 'low', count: 20 }),
        AT_ZERO,
        freshTally(),
      )
      admitSpray(pool, request({ kind: 'dust', count: 20 }), AT_ZERO, freshTally())
      stepFor(pool, SPARKS_GONE_SECONDS, stepsPerSecond)
      expect(pool.particles.count).toBe(20)
      expect(pool.lowCount).toBe(0)
      stepFor(pool, SPRAY_LOOKS.dust.lifeSeconds, stepsPerSecond)
      expect(pool.particles.count).toBe(0)
    }
  })

  it('keeps each surviving piece’s kind and priority as burnt-out ones leave', () => {
    const pool = createSprayPool()
    admitSpray(pool, request({ kind: 'spark', priority: 'low', count: 4 }), AT_ZERO, freshTally())
    admitSpray(pool, request({ kind: 'dust', count: 4 }), AT_ZERO, freshTally())
    stepFor(pool, SPARKS_GONE_SECONDS, 60)
    const kinds = Array.from({ length: pool.particles.count }, (_, at) => kindAt(pool, at))
    expect(kinds).toEqual(['dust', 'dust', 'dust', 'dust'])
    expect(lowPiecesIn(pool)).toBe(0)
  })
})
