import { describe, expect, it } from 'vitest'
import {
  POP_MERGE_WINDOW_SECONDS,
  POP_RATE_PER_SECOND,
  POP_RATE_PER_SECOND_NARROW,
} from '../../constants/materialPop'
import { TICKS_PER_SECOND } from '../../constants/physics'
import { createPopFind, type PopFind, type PopLane } from './popFinds'
import {
  createPopThinning,
  popRatePerSecondOf,
  startQueuedSpecial,
  thinPopFinds,
  type PopSink,
} from './popThinning'

// Option B's thinning (final B bars on #442): under 12 pops a second each cell pops; above it a
// material's pops merge inside 0.25 s, commons drop first, rare-or-better never drop, specials
// never merge or drop and queue across ticks.

const MERGE_TICKS = POP_MERGE_WINDOW_SECONDS * TICKS_PER_SECOND

interface Shown {
  started: { materialId: string; lane: PopLane; tick: number; serial: number }[]
  merged: number[]
}

function recordingSink(shown: Shown, tick: () => number, hasRoom = true): PopSink {
  return {
    startPop: (find, serial) => {
      shown.started.push({ materialId: find.materialId, lane: find.lane, tick: tick(), serial })
      return hasRoom
    },
    mergeIntoPop: (serial) => shown.merged.push(serial),
  }
}

function findOf(materialId: string, lane: PopLane, tick: number): PopFind {
  return { ...createPopFind(), materialId, lane, tick, step: lane === 'common' ? 0 : 2 }
}

function freshRun() {
  const thinning = createPopThinning()
  const shown: Shown = { started: [], merged: [] }
  let now = 0
  const sink = recordingSink(shown, () => now)
  const batch = (tick: number, finds: PopFind[]) => {
    now = tick
    thinPopFinds(thinning, finds, finds.length, tick, sink)
  }
  return { thinning, shown, sink, batch, at: (tick: number) => (now = tick) }
}

describe('material pop thinning', () => {
  it('starts one pop per cell, on its carve tick, while under the rate', () => {
    const run = freshRun()
    for (let cell = 0; cell < POP_RATE_PER_SECOND; cell++) {
      run.batch(cell * 5, [findOf('copper', 'common', cell * 5)])
    }
    expect(run.shown.started).toHaveLength(POP_RATE_PER_SECOND)
    expect(run.shown.started.every((pop, cell) => pop.tick === cell * 5)).toBe(true)
    expect(run.thinning.tally.startLagTicksMost).toBe(0)
  })

  it('merges a common pop over the rate into its material’s pop of the last 0.25 s', () => {
    const run = freshRun()
    const burst = Array.from({ length: POP_RATE_PER_SECOND + 3 }, () =>
      findOf('copper', 'common', 1),
    )
    run.batch(1, burst)
    expect(run.shown.started).toHaveLength(POP_RATE_PER_SECOND)
    expect(run.shown.merged).toHaveLength(3)
    expect(run.thinning.tally.dropped).toBe(0)
  })

  it('drops a common pop over the rate with no pop of its material to merge into', () => {
    const run = freshRun()
    const burst = Array.from({ length: POP_RATE_PER_SECOND }, () => findOf('copper', 'common', 1))
    run.batch(1, burst)
    run.batch(MERGE_TICKS + 2, [findOf('copper', 'common', MERGE_TICKS + 2)])
    run.batch(MERGE_TICKS + 2, [findOf('tin', 'common', MERGE_TICKS + 2)])
    expect(run.shown.started).toHaveLength(POP_RATE_PER_SECOND)
    expect(run.thinning.tally.dropped).toBe(2)
  })

  it('starts a rare pop over the rate when its material has no pop to merge into', () => {
    const run = freshRun()
    run.batch(
      1,
      Array.from({ length: POP_RATE_PER_SECOND }, () => findOf('copper', 'common', 1)),
    )
    run.batch(2, [findOf('ruby', 'guarded', 2), findOf('ruby', 'guarded', 2)])
    run.batch(2 + MERGE_TICKS, [findOf('ruby', 'guarded', 2 + MERGE_TICKS)])
    const rubies = run.shown.started.filter((pop) => pop.materialId === 'ruby')
    expect(rubies.map((pop) => pop.tick)).toEqual([2, 2 + MERGE_TICKS])
    expect(run.shown.merged).toEqual([rubies[0].serial])
    expect(run.thinning.tally.dropped).toBe(0)
  })

  it('spends the rate’s room on rare finds before commons in one batch', () => {
    const run = freshRun()
    const commons = Array.from({ length: POP_RATE_PER_SECOND }, (_, at) =>
      findOf(`ore${at}`, 'common', 1),
    )
    run.batch(1, [...commons, findOf('ruby', 'guarded', 1)])
    expect(run.shown.started[0].materialId).toBe('ruby')
    expect(run.thinning.tally.dropped).toBe(1)
  })

  it('opens the rate again a second after the starts', () => {
    const run = freshRun()
    run.batch(
      1,
      Array.from({ length: POP_RATE_PER_SECOND }, () => findOf('copper', 'common', 1)),
    )
    run.batch(1 + TICKS_PER_SECOND, [findOf('tin', 'common', 1 + TICKS_PER_SECOND)])
    expect(run.shown.started).toHaveLength(POP_RATE_PER_SECOND + 1)
  })

  it('merges at 8 pops a second below 720 px wide', () => {
    expect([popRatePerSecondOf(360), popRatePerSecondOf(719), popRatePerSecondOf(720)]).toEqual([
      POP_RATE_PER_SECOND_NARROW,
      POP_RATE_PER_SECOND_NARROW,
      POP_RATE_PER_SECOND,
    ])
    const run = freshRun()
    run.thinning.ratePerSecond = popRatePerSecondOf(360)
    run.batch(
      1,
      Array.from({ length: 10 }, () => findOf('copper', 'common', 1)),
    )
    expect(run.shown.started).toHaveLength(POP_RATE_PER_SECOND_NARROW)
    expect(run.shown.merged).toHaveLength(10 - POP_RATE_PER_SECOND_NARROW)
  })

  it('never merges or drops a special: one starts a tick, the rest queue across ticks', () => {
    const run = freshRun()
    run.batch(
      1,
      Array.from({ length: POP_RATE_PER_SECOND }, () => findOf('copper', 'common', 1)),
    )
    run.batch(5, [findOf('relic', 'special', 5), findOf('relic', 'special', 5)])
    run.batch(5, [findOf('relic', 'special', 5)])
    expect(run.thinning.tally.queued).toBe(2)
    for (let tick = 5; tick <= 8; tick++) {
      run.at(tick)
      startQueuedSpecial(run.thinning, tick, run.sink)
    }
    const relics = run.shown.started.filter((pop) => pop.lane === 'special')
    expect(relics.map((pop) => pop.tick)).toEqual([5, 6, 7])
    expect(run.shown.merged).toEqual([])
    expect(run.thinning.tally).toMatchObject({ dropped: 0, queued: 0 })
  })

  it('counts a pop the pool had no room for as dropped', () => {
    const thinning = createPopThinning()
    const shown: Shown = { started: [], merged: [] }
    const full = recordingSink(shown, () => 1, false)
    thinPopFinds(thinning, [findOf('copper', 'common', 1)], 1, 1, full)
    expect(thinning.tally).toMatchObject({ started: 0, dropped: 1 })
  })
})
