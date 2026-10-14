import { describe, expect, it } from 'vitest'
import { createDebugApi } from '../debug/debugApi'
import { requestSpray } from '../store/sprayRequests'
import { createSprayPool, type SprayRequest } from '../systems/render/sprayPool'
import { admitRequestedSprays } from './sprayIntake'

// The kernel spray layer's intake (ticket 348): what anyone requests lands in the layer's pool,
// and overflow is dropped and counted where `steampunkDebug.ui.getSprayStats()` reads it.

const TRACER: SprayRequest = {
  kind: 'spark',
  x: 10,
  y: 4,
  dirX: 0,
  dirY: 1,
  count: 30,
  priority: 'low',
}

function readSprayStats() {
  const result = createDebugApi().ui.getSprayStats()
  if (!result.ok) throw new Error(result.problems.join('; '))
  return result.stats
}

describe('spray intake', () => {
  it('admits each request into the pool, measured from the pool’s render origin', () => {
    const pool = createSprayPool()
    const stopAdmitting = admitRequestedSprays(pool, { x: 8, y: 0 })
    requestSpray({ ...TRACER, count: 2 })
    stopAdmitting()
    expect(pool.particles.count).toBe(2)
    expect(pool.particles.x[0]).toBe(2)
  })

  it('stops admitting once the layer lets go', () => {
    const pool = createSprayPool()
    admitRequestedSprays(pool, { x: 0, y: 0 })()
    requestSpray(TRACER)
    expect(pool.particles.count).toBe(0)
  })

  it('counts the tracer pieces past the low share as dropped, for the debug read', () => {
    const before = readSprayStats()
    const pool = createSprayPool()
    const stopAdmitting = admitRequestedSprays(pool, { x: 0, y: 0 })
    requestSpray(TRACER)
    requestSpray(TRACER)
    stopAdmitting()
    const after = readSprayStats()
    expect(after.requested - before.requested).toBe(60)
    expect(after.dropped - before.dropped).toBe(12)
    expect(after.budget).toEqual({ drawCalls: 1, instances: 96 })
  })
})
