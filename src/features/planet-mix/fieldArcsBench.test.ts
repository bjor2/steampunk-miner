import { describe, expect, it } from 'vitest'
import { debugActionsBySlice } from '../../debug/debugActionRegistry'
import { FIELD_ARC_BENCH_PLANET, timeFieldArcFrames } from './fieldArcsBench'

/** A clock that moves one millisecond each read, so every timed frame reads 1 ms. */
function steppingClock(): () => number {
  let now = 0
  return () => (now += 1)
}

describe('field arcs bench', () => {
  it('times a P43 descent at top speed on one buffer, re-picking only at chunk crossings', () => {
    const times = timeFieldArcFrames(83921, steppingClock())
    expect(times.planetIndex).toBe(FIELD_ARC_BENCH_PLANET)
    expect(times.before).toHaveLength(times.after.length)
    expect(times.after.length).toBeGreaterThan(1000)
    expect(times.bufferReallocations).toBe(0)
    expect(times.picks.length).toBeGreaterThan(1)
    expect(times.picks.length).toBeLessThan(times.after.length / 60)
    expect(times.arcs).toBeGreaterThan(0)
  })

  it('is reached through the slice’s debug action, refusing a call with no clock', () => {
    const action = debugActionsBySlice()['planet-mix']?.timeFieldArcFrames
    expect(action?.(83921, 'soon')).toEqual({
      ok: false,
      problems: ['timeFieldArcFrames takes a world seed and a clock'],
    })
  })
})
