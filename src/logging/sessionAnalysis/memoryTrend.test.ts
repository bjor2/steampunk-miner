import { describe, expect, it } from 'vitest'
import { countTrendsOf, heapTrendsOf, WARM_UP_SAMPLES } from './memoryTrend'
import { memorySampleData, runEventLine, sessionOf, type MemoryFields } from './sessionFixtures'
import { slopeOf } from './trendMaths'

const RUN = 'run_2026-10-06_12-00-00'

/** One memory_sample every 10 s of frames, 600 ticks apart, as #121 writes them. */
function sessionOfSamples(samples: readonly Omit<MemoryFields, 'elapsedS'>[]) {
  return sessionOf(
    samples.map((fields, at) =>
      runEventLine(
        RUN,
        at,
        { tick: 600 * (at + 1) },
        'memory_sample',
        memorySampleData({ ...fields, elapsedS: 10 * (at + 1) }),
      ),
    ),
  )
}

/** Warm-up samples a spec does not care about, then the settled ones it does. */
function afterWarmUp(settled: readonly Omit<MemoryFields, 'elapsedS'>[]) {
  const warmUp = Array.from({ length: WARM_UP_SAMPLES }, () => ({ heapKB: 1 }))
  return sessionOfSamples([...warmUp, ...settled])
}

describe('memory trend', () => {
  it('measures heap growth per 100 minerals, per 10 minutes and per 100 chunks', () => {
    // +1 MiB per sample (10 s), while 10 minerals and 5 chunks come in.
    const session = afterWarmUp(
      [0, 1, 2, 3].map((at) => ({
        heapKB: 50_000 + 1024 * at,
        minerals: 10 * at,
        chunksCached: 12 + 5 * at,
      })),
    )
    const [trend] = heapTrendsOf([session])
    expect(trend.samples).toBe(4)
    expect(trend.mbPer100Minerals).toBeCloseTo(10)
    expect(trend.mbPer10Minutes).toBeCloseTo(60)
    expect(trend.mbPer100Chunks).toBeCloseTo(20)
    expect(trend.heapLastMB - trend.heapFirstMB).toBeCloseTo(3)
  })

  it('skips the warm-up samples, so loading does not read as growth', () => {
    const session = sessionOfSamples([
      { heapKB: 10_000, minerals: 0 },
      { heapKB: 30_000, minerals: 1 },
      { heapKB: 50_000, minerals: 2 },
      { heapKB: 50_000, minerals: 3 },
      { heapKB: 50_000, minerals: 4 },
    ])
    expect(heapTrendsOf([session])[0].mbPer100Minerals).toBe(0)
  })

  it('has no per-mineral slope while no mineral was collected', () => {
    const session = afterWarmUp([{ heapKB: 50_000 }, { heapKB: 60_000 }])
    expect(heapTrendsOf([session])[0].mbPer100Minerals).toBeNull()
  })

  it('leaves out a session with no sample after warm-up', () => {
    expect(heapTrendsOf([sessionOfSamples([{ heapKB: 1 }])])).toEqual([])
    expect(countTrendsOf([sessionOfSamples([{ heapKB: 1 }])])).toEqual([])
  })

  it('calls geometries climbing when they rose in 3 of the last 10 steps and never fell', () => {
    const geometries = [30, 30, 31, 31, 32, 32, 33]
    const session = afterWarmUp(
      geometries.map((count, at) => ({ heapKB: 50_000, geometries: count, chunksCached: 10 + at })),
    )
    const trend = countTrendsOf([session]).find((one) => one.count === 'geometries')
    expect(trend).toMatchObject({ first: 30, last: 33, risingSteps: 3, isClimbing: true })
    expect(trend?.per100Chunks).toBeGreaterThan(0)
  })

  it('keeps a count that rises and falls back flat, as pooled meshes do', () => {
    const textures = [17, 18, 17, 18, 17, 18, 17]
    const session = afterWarmUp(textures.map((count) => ({ heapKB: 50_000, textures: count })))
    const trend = countTrendsOf([session]).find((one) => one.count === 'textures')
    expect(trend?.isClimbing).toBe(false)
  })
})

describe('trend maths', () => {
  it('fits the least-squares slope and has none without spread in x', () => {
    expect(
      slopeOf([
        [0, 1],
        [1, 3],
        [2, 5],
      ]),
    ).toBeCloseTo(2)
    expect(
      slopeOf([
        [4, 1],
        [4, 9],
      ]),
    ).toBeNull()
  })
})
