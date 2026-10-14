import { describe, expect, it } from 'vitest'
import { debugActionsBySlice } from '../../debug/debugActionRegistry'
import { MAGNET_FIELD_BENCH_PLANET, timeMagnetFieldFrames } from './magnetFieldsBench'

/** A clock that moves one millisecond each read, so every timed frame reads 1 ms. */
function steppingClock(): () => number {
  let now = 0
  return () => (now += 1)
}

describe('magnet fields bench', () => {
  it('times a P43 descent with three players’ fields on one buffer, rebuilding only on change', () => {
    const times = timeMagnetFieldFrames(83921, steppingClock())
    expect(times.planetIndex).toBe(MAGNET_FIELD_BENCH_PLANET)
    expect(times.before).toHaveLength(times.after.length)
    expect(times.after.length).toBeGreaterThan(1000)
    expect(times.bufferReallocations).toBe(0)
    expect(times.rebuilds.length).toBeGreaterThan(1)
    expect(times.rebuilds.length).toBeLessThan(times.after.length / 4)
    expect(times.pieces).toBeGreaterThan(34)
    expect(times.pieces).toBeLessThanOrEqual(40)
  })

  it('is reached through the slice’s debug action, refusing a call with no clock', () => {
    const action = debugActionsBySlice()['terrain-tools']?.timeMagnetFieldFrames
    expect(action?.(83921, 'soon')).toEqual({
      ok: false,
      problems: ['timeMagnetFieldFrames takes a world seed and a clock'],
    })
  })
})
