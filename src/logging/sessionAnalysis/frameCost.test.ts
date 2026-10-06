import { describe, expect, it } from 'vitest'
import { frameCostRowsOf } from './frameCost'
import { frameStretchesOf, slowdownsByOreBefore } from './frameStretches'
import { collectedData, perfSampleData, runEventLine, sessionOf } from './sessionFixtures'
import type { RunEvent } from '../runEvent'

const RUN = 'run_2026-10-06_12-00-00'

/** Lines in the order a session logs them, one second (60 ticks) apart, seq in that order. */
function sessionOfLines(
  lines: readonly ((seq: number, tick: number) => RunEvent)[],
): ReturnType<typeof sessionOf> {
  return sessionOf(lines.map((line, at) => line(at, 60 * (at + 1))))
}

function second(frameMsP95: number, depthTiles = 0, longTasks = 0, planet = 1) {
  return (seq: number, tick: number) =>
    runEventLine(
      RUN,
      seq,
      { tick, depthTiles, planet },
      'perf_sample',
      perfSampleData(frameMsP95, longTasks, frameMsP95 + 4),
    )
}

function collected(oreId: string, depthTiles: number, chunk: string) {
  return (seq: number, tick: number) =>
    runEventLine(
      RUN,
      seq,
      { tick, depthTiles },
      'resource_collected',
      collectedData(oreId, depthTiles, chunk),
    )
}

describe('frame cost by planet and depth band', () => {
  it('groups seconds by planet and band with the median p95, worst p99 and long tasks', () => {
    const session = sessionOfLines([
      second(10, 0),
      second(12, 2, 1),
      second(30, 2, 3),
      second(9, 0, 0, 2),
    ])
    const rows = frameCostRowsOf([session])
    expect(rows.map(({ planet, band, samples }) => [planet, band, samples])).toEqual([
      [1, 1, 3],
      [2, 1, 1],
    ])
    expect(rows[0]).toMatchObject({
      medianFrameMsP95: 12,
      worstFrameMsP99: 34,
      longTasks: 4,
      secondsOverBudget: 1,
    })
  })

  it('puts a deep second in a deeper band than a surface one', () => {
    const rows = frameCostRowsOf([sessionOfLines([second(10, 1), second(10, 60)])])
    expect(rows).toHaveLength(2)
    expect(rows[1].band).toBeGreaterThan(rows[0].band)
  })
})

describe('frame stretches', () => {
  it('finds each run of seconds over the 16.7 ms budget as one slowdown', () => {
    const session = sessionOfLines([
      second(10),
      second(20),
      second(25, 0, 2),
      second(10),
      second(18),
    ])
    const slowdowns = frameStretchesOf([session], 'slowdown')
    expect(slowdowns.map(({ seconds, fromTick, toTick }) => [seconds, fromTick, toTick])).toEqual([
      [2, 120, 180],
      [1, 300, 300],
    ])
    expect(slowdowns[0]).toMatchObject({ worstFrameMsP99: 29, longTasks: 2 })
  })

  it('finds long-task bursts apart from slowdowns', () => {
    const session = sessionOfLines([second(10, 0, 1), second(10, 0, 2), second(30)])
    const bursts = frameStretchesOf([session], 'longTaskBurst')
    expect(bursts.map(({ seconds, longTasks }) => [seconds, longTasks])).toEqual([[2, 3]])
  })

  it('names the ore, its depth and chunk last collected before a slowdown', () => {
    const session = sessionOfLines([
      collected('kernel.metal.t1', 12, '0,-3'),
      second(10),
      collected('kernel.crystal.t2', 14, '1,-3'),
      second(40, 14),
      collected('kernel.metal.t1', 15, '1,-3'),
      second(40, 15),
    ])
    const [slowdown] = frameStretchesOf([session], 'slowdown')
    expect(slowdown.mineralBefore).toEqual({
      oreId: 'kernel.crystal.t2',
      oreDepthTiles: 14,
      chunk: '1,-3',
      ticksBefore: 60,
    })
  })

  it('has no mineral before a slowdown that came before any collection', () => {
    const [slowdown] = frameStretchesOf([sessionOfLines([second(40)])], 'slowdown')
    expect(slowdown.mineralBefore).toBeNull()
  })

  it('counts how many slowdowns each ore came right before', () => {
    const session = sessionOfLines([
      collected('kernel.metal.t1', 3, '0,-1'),
      second(40),
      second(10),
      second(40),
      second(10),
      collected('kernel.crystal.t2', 4, '0,-1'),
      second(40),
    ])
    const counts = slowdownsByOreBefore(frameStretchesOf([session], 'slowdown'))
    expect([...counts]).toEqual([
      ['kernel.metal.t1', 2],
      ['kernel.crystal.t2', 1],
    ])
  })
})
